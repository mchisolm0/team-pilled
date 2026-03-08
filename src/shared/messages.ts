import type { ExtensionConfig, SyncState, UserBadgeData } from "./types";

export const MESSAGE_TYPES = {
  loadConfig: "LOAD_CONFIG",
  saveConfig: "SAVE_CONFIG",
  getUserBadgeData: "GET_USER_BADGE_DATA",
  openOptionsPage: "OPEN_OPTIONS_PAGE",
  getSyncStatus: "GET_SYNC_STATUS"
} as const;

export type LoadConfigMessage = {
  type: typeof MESSAGE_TYPES.loadConfig;
};

export type SaveConfigMessage = {
  type: typeof MESSAGE_TYPES.saveConfig;
  payload: ExtensionConfig;
};

export type GetUserBadgeDataMessage = {
  type: typeof MESSAGE_TYPES.getUserBadgeData;
  payload: {
    usernames: string[];
  };
};

export type OpenOptionsPageMessage = {
  type: typeof MESSAGE_TYPES.openOptionsPage;
};

export type GetSyncStatusMessage = {
  type: typeof MESSAGE_TYPES.getSyncStatus;
};

export type RuntimeMessage =
  | LoadConfigMessage
  | SaveConfigMessage
  | GetUserBadgeDataMessage
  | OpenOptionsPageMessage
  | GetSyncStatusMessage;

export type UserBadgeDataResponse = {
  status: SyncState["status"];
  message?: string;
  users: Record<string, UserBadgeData>;
};
