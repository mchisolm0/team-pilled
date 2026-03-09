import { MESSAGE_TYPES, type RuntimeMessage } from "../shared/messages";
import { DEFAULT_ISSUE_COUNT_CACHE_MINUTES, TEAM_COLOR_OPTIONS, validateConfig, type ExtensionConfig, type SyncState } from "../shared/types";

type SaveResponse = {
  ok: boolean;
  message?: string;
};

const form = document.getElementById("config-form") as HTMLFormElement;
const groupsList = document.getElementById("groups-list") as HTMLDivElement;
const template = document.getElementById("group-row-template") as HTMLTemplateElement;
const statusCard = document.getElementById("status-card") as HTMLDivElement;
const showIssueCountsField = document.getElementById("show-issue-counts") as HTMLInputElement;
const issueCountCacheMinutesField = document.getElementById("issue-count-cache-minutes") as HTMLInputElement;

function sendMessage<T>(message: RuntimeMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response as T);
    });
  });
}

function moveRow(row: HTMLElement, direction: -1 | 1): void {
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;

  if (!sibling || !row.parentElement) {
    return;
  }

  if (direction < 0) {
    row.parentElement.insertBefore(row, sibling);
  } else {
    row.parentElement.insertBefore(sibling, row);
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createGroupRow(group?: ExtensionConfig["groups"][number]): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const row = fragment.querySelector<HTMLElement>(".group-row");

  if (!row) {
    throw new Error("Missing group row template.");
  }

  const colorSelect = row.querySelector<HTMLSelectElement>('select[data-field="color"]');

  if (!colorSelect) {
    throw new Error("Missing group color select.");
  }

  colorSelect.innerHTML = TEAM_COLOR_OPTIONS.map((color) => `<option value="${color}">${titleCase(color)}</option>`).join("");

  const labelInput = row.querySelector<HTMLInputElement>('input[data-field="label"]');
  const usernamesInput = row.querySelector<HTMLTextAreaElement>('textarea[data-field="usernames"]');

  if (labelInput) {
    labelInput.value = group?.label ?? "";
  }

  if (usernamesInput) {
    usernamesInput.value = group?.usernames.join("\n") ?? "";
  }

  colorSelect.value = group?.color ?? "gray";

  row.querySelector<HTMLButtonElement>('[data-action="move-up"]')?.addEventListener("click", () => {
    moveRow(row, -1);
  });

  row.querySelector<HTMLButtonElement>('[data-action="move-down"]')?.addEventListener("click", () => {
    moveRow(row, 1);
  });

  row.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", () => {
    row.remove();

    if (!groupsList.children.length) {
      groupsList.append(createGroupRow());
    }
  });

  return row;
}

function parseUsernames(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((username) => username.trim())
    .filter(Boolean);
}

function readConfigFromForm(): ExtensionConfig {
  const groupRows = [...groupsList.querySelectorAll<HTMLElement>(".group-row")];

  return {
    showIssueCounts: showIssueCountsField.checked,
    issueCountCacheMinutes: Number(issueCountCacheMinutesField.value),
    groups: groupRows.map((row) => ({
      label: row.querySelector<HTMLInputElement>('input[data-field="label"]')?.value ?? "",
      color: (row.querySelector<HTMLSelectElement>('select[data-field="color"]')?.value ?? "gray") as ExtensionConfig["groups"][number]["color"],
      usernames: parseUsernames(row.querySelector<HTMLTextAreaElement>('textarea[data-field="usernames"]')?.value ?? "")
    }))
  };
}

function renderConfig(config: Partial<ExtensionConfig> | null): void {
  showIssueCountsField.checked = config?.showIssueCounts ?? true;
  issueCountCacheMinutesField.value = String(config?.issueCountCacheMinutes ?? DEFAULT_ISSUE_COUNT_CACHE_MINUTES);
  groupsList.innerHTML = "";

  for (const group of config?.groups ?? []) {
    groupsList.append(createGroupRow(group));
  }

  if (!groupsList.children.length) {
    groupsList.append(createGroupRow());
  }
}

function renderStatus(status: SyncState["status"], message: string, updatedAt?: number): void {
  statusCard.className = `status-card status-card--${status}`;
  statusCard.innerHTML = "";

  const title = document.createElement("strong");
  title.textContent =
    status === "ok"
      ? "Saved"
      : status === "config_error"
        ? "Configuration error"
        : status === "rate_limited"
          ? "Rate limited"
          : "Needs attention";

  const body = document.createElement("p");
  body.textContent = updatedAt ? `${message} Last updated ${new Date(updatedAt).toLocaleString()}.` : message;

  statusCard.append(title, body);
}

async function loadInitialState(): Promise<void> {
  const [config, syncState] = await Promise.all([
    sendMessage<ExtensionConfig | null>({ type: MESSAGE_TYPES.loadConfig }),
    sendMessage<SyncState>({ type: MESSAGE_TYPES.getSyncStatus })
  ]);

  renderConfig(config);
  renderStatus(syncState.status, syncState.message ?? "Status unavailable.", syncState.updatedAt);
}

async function save(): Promise<void> {
  const config = readConfigFromForm();
  const validation = validateConfig(config);

  if (!validation.valid) {
    renderStatus("config_error", validation.message);
    return;
  }

  const response = await sendMessage<SaveResponse>({
    type: MESSAGE_TYPES.saveConfig,
    payload: validation.config
  });

  if (!response.ok) {
    renderStatus("config_error", response.message ?? "Could not save configuration.");
    return;
  }

  renderConfig(validation.config);
  const syncState = await sendMessage<SyncState>({ type: MESSAGE_TYPES.getSyncStatus });
  renderStatus(syncState.status, syncState.message ?? "Configuration saved.", syncState.updatedAt);
}

document.getElementById("add-group")?.addEventListener("click", () => {
  groupsList.append(createGroupRow());
});

document.getElementById("save-config")?.addEventListener("click", () => {
  void save();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

void loadInitialState();
