export type XBoxDBRecord = {
    XUID: string;
    Games: Game[];
}

export type PresenceResponse = {
    xuid: string,
    devices: {
        type: string,
        titles: {
            id: string,
            name: string,
            lastModified: string,
            state: string,
            placement: string
        }[]
    }[]
}

export type Game = {
    name: string;
    Subscribers: string[]
}

export type User = {
    XUID: string,
    username: string,
    Games: Game[]
}