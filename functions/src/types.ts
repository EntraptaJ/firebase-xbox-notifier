export type XBoxDBRecord = {
  XUID: string;
  Games: Game[];
  notified: boolean;
};

export type PresenceResponse = {
  xuid: string;
  state: string;
  devices: {
    type: string;
    titles: {
      id: string;
      name: string;
      lastModified: string;
      state: string;
      placement: string;
    }[];
  }[];
  lastSeen: {
    deviceType: string;
    titleId: string;
    titleName: string;
    timestamp: string;
  };
};

export type Subscribers = {
  token: string;
  notified: boolean;
};

export type Game = {
  name: string;
  Subscribers: Subscribers[];
};

export type User = {
  XUID: string;
  username: string;
  Games: Game[];
};
