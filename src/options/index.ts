import { MESSAGE_TYPES } from "../shared/messages";
import { DEFAULT_REFRESH_INTERVAL_MINUTES, TEAM_COLOR_OPTIONS, validateConfig, type ExtensionConfig } from "../shared/types";

type SaveResponse = {
  ok: boolean;
  message?: string;
};

type SyncState = {
  status: "ok" | "degraded" | "config_error" | "auth_error" | "rate_limited";
  message?: string;
  updatedAt: number;
};

const form = document.getElementById("config-form") as HTMLFormElement;
const teamsList = document.getElementById("teams-list") as HTMLDivElement;
const template = document.getElementById("team-row-template") as HTMLTemplateElement;
const statusCard = document.getElementById("status-card") as HTMLDivElement;

function sendMessage<T>(message: unknown): Promise<T> {
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

function createTeamRow(team?: ExtensionConfig["teams"][number]): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const row = fragment.querySelector<HTMLElement>(".team-row");

  if (!row) {
    throw new Error("Missing team row template.");
  }

  const colorSelect = row.querySelector<HTMLSelectElement>('select[data-field="color"]');
  if (!colorSelect) {
    throw new Error("Missing team color select.");
  }

  colorSelect.innerHTML = TEAM_COLOR_OPTIONS.map((color) => `<option value="${color}">${color}</option>`).join("");

  const slugInput = row.querySelector<HTMLInputElement>('input[data-field="slug"]');
  const labelInput = row.querySelector<HTMLInputElement>('input[data-field="label"]');
  if (slugInput) {
    slugInput.value = team?.slug ?? "";
  }
  if (labelInput) {
    labelInput.value = team?.label ?? "";
  }
  colorSelect.value = team?.color ?? "gray";

  row.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", () => {
    row.remove();
  });

  return row;
}

function readConfigFromForm(): ExtensionConfig {
  const teamRows = [...teamsList.querySelectorAll<HTMLElement>(".team-row")];

  return {
    org: (document.getElementById("org") as HTMLInputElement).value,
    githubToken: (document.getElementById("github-token") as HTMLInputElement).value,
    refreshIntervalMinutes: Number((document.getElementById("refresh-interval") as HTMLInputElement).value),
    teams: teamRows.map((row) => ({
      slug: row.querySelector<HTMLInputElement>('input[data-field="slug"]')?.value ?? "",
      label: row.querySelector<HTMLInputElement>('input[data-field="label"]')?.value ?? "",
      color: (row.querySelector<HTMLSelectElement>('select[data-field="color"]')?.value ?? "gray") as ExtensionConfig["teams"][number]["color"]
    }))
  };
}

function renderConfig(config: Partial<ExtensionConfig> | null): void {
  (document.getElementById("org") as HTMLInputElement).value = config?.org ?? "";
  (document.getElementById("github-token") as HTMLInputElement).value = config?.githubToken ?? "";
  (document.getElementById("refresh-interval") as HTMLInputElement).value = String(
    config?.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES
  );
  teamsList.innerHTML = "";

  for (const team of config?.teams ?? []) {
    teamsList.append(createTeamRow(team));
  }

  if (!teamsList.children.length) {
    teamsList.append(createTeamRow());
  }
}

function renderStatus(status: SyncState["status"], message: string, updatedAt?: number): void {
  statusCard.className = `status-card status-card--${status}`;
  statusCard.innerHTML = "";

  const title = document.createElement("strong");
  title.textContent = status.replaceAll("_", " ");

  const body = document.createElement("p");
  body.textContent = updatedAt
    ? `${message} Last updated ${new Date(updatedAt).toLocaleString()}.`
    : message;

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

  const syncState = await sendMessage<SyncState>({ type: MESSAGE_TYPES.getSyncStatus });
  renderStatus(syncState.status, syncState.message ?? "Configuration saved.", syncState.updatedAt);
}

document.getElementById("add-team")?.addEventListener("click", () => {
  teamsList.append(createTeamRow());
});

document.getElementById("save-config")?.addEventListener("click", () => {
  void save();
});

document.getElementById("toggle-token")?.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const input = document.getElementById("github-token") as HTMLInputElement;
  const nextType = input.type === "password" ? "text" : "password";
  input.type = nextType;
  button.textContent = nextType === "password" ? "Show" : "Hide";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

void loadInitialState();
