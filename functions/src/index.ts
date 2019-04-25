import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
    PresenceResponse,
    Game,
    User as UserRecord,
    XBoxDBRecord
} from './types';

admin.initializeApp(functions.config().firebase);

let Users: import('./types').User[] = []; // The array used for storing User data within this execution
const XUIDs: string[] = [];
const Games: string[] = [];

const ProcessDocuments = async (doc: FirebaseFirestore.DocumentReference) => {
    let document = await doc.get();
    let data = document.data() as XBoxDBRecord;
    data.Games.map(({ name }) => {
        Games.push(name);
    });
    Users.push({
        XUID: data.XUID,
        username: doc.path.replace(/XBox\//, ''),
        Games: data.Games,
        notified: data.notified
    });
    XUIDs.push(data.XUID);
    return;
};

const ProcessUserPresence = async (item: PresenceResponse): Promise<void> => {
    let user = Users.find(a => a.XUID === item.xuid) as UserRecord;
    if (!item.devices) {
        if (user.notified === false) return 
        await SetNotified(user.username, false);
        return;
    }
    if (item.devices)
        item.devices.map(({ titles }) =>
            titles.map(({ name }) => {
                if (!Games.includes(name)) return;
                const { Subscribers } = user.Games.find(
                    item => item.name == name
                ) as Game;
                Subscribers.map(async token => {
                    const db = admin.firestore().collection('XBox');
                    const { notified } = (await db
                        .doc(user.username)
                        .get()).data() as XBoxDBRecord;
                    if (!notified)
                        await SendNotification({
                            token,
                            name,
                            username: user.username
                        });
                    return;
                });
            })
        );
};

type SendNotificationArgs = {
    token: string;
    username: string;
    name: string;
};

const SendNotification = async ({
    token,
    username,
    name
}: SendNotificationArgs) => {
    admin.messaging().send({
        token: token,
        android: {
            notification: {
                tag: `MC-${username}-${name}`,
                channelId: 'games-notify'
            }
        },
        notification: {
            title: 'XBox Notifier',
            body: `${username} is Online on ${name}`
        }
    });

    await SetNotified(username, true);
};

export const scheduledFunction = functions.pubsub
    .schedule(`every 1 minutes`)
    .onRun(async context => {
        const [got, { authenticate }] = await Promise.all([
            import('got'),
            import('@xboxreplay/xboxlive-auth')
        ]);

        let db = admin.firestore().collection('XBox'); // The Firebase Firestore for storing Users subscription data.
        let doc = db.listDocuments();
        let [{ userHash, XSTSToken }, docs] = await Promise.all([
            authenticate(
                functions.config().xbox.usr,
                functions.config().xbox.psw
            ),
            doc
        ]);

        await Promise.all(docs.map(item => ProcessDocuments(item)));
        const {
            body
        }: { body: import('./types').PresenceResponse[] } = await got.post(
            `https://userpresence.xboxlive.com/users/batch`,
            {
                json: true,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'x-xbl-contract-version': 3,
                    Authorization: `XBL3.0 x=${userHash};${XSTSToken}`,
                    'Accept-Language': 'en-US'
                },
                body: {
                    users: XUIDs
                }
            }
        );

        await Promise.all(body.map(item => ProcessUserPresence(item)));
        return;
        /*
        body.map(item => {
            const c = usrs.find(
                a => a.XUID == item.xuid
            ) as import('./types').User;

            if (item.devices) {
                item.devices.map(({ titles }) => {
                    titles.map(({ name }) => {
                        if (Games.includes(name)) {
                            let { Subscribers } = c.Games.find(
                                item => item.name == name
                            ) as import('./types').Game;
                            Subscribers.map(i => {
                                const MSG = admin.messaging();

                                if (!c.notified) {
                                    MSG.send({
                                        token: i,
                                        android: {
                                            notification: {
                                                tag: `MC-${c.username}-${name}`,
                                                channelId: 'games-notify'
                                            }
                                        },
                                        notification: {
                                            title: 'XBox Notifier',
                                            body: `${
                                                c.username
                                            } is Online on ${name}`
                                        }
                                    });
                                    SetNotified(c.username, true);
                                }
                            });
                        }
                    });
                });
            } else {
                SetNotified(c.username, false);
            }
        }); */
    });

const SetNotified = async (username: string, notified: boolean) => {
    const db = admin.firestore().collection('XBox');
    const doc = db.doc(username);
    await doc.set(
        {
            notified: notified
        },
        { merge: true }
    );
    return;
};

export const AddSubscriber = functions.https.onRequest(async (req, res) => {
    const { username, token, game } = req.body.data as {
        username: string;
        token: string;
        game: string;
    };
    const db = admin.firestore().collection('XBox');
    const doc = db.doc(username);
    const document = await doc.get();
    const exists = document.exists;
    if (!exists) {
        const [got] = await Promise.all([import('got')]);
        const {
            body: { xuid }
        } = await got.get(`https://xboxapi.com/v2/xuid/${username}`, {
            json: true,
            headers: {
                'X-AUTH': functions.config().xbox.api
            }
        });

        await doc.create({
            XUID: xuid,
            Games: [{ name: game, Subscribers: [token] }],
            notified: false
        });
    } else {
        const data = document.data() as import('./types').XBoxDBRecord;
        if (!data.Games.some(item => item.name == game))
            await doc.set(
                {
                    Games: [
                        ...data.Games,
                        { name: game, notified: false, Subscribers: [token] }
                    ]
                },
                { merge: true }
            );

        const Game = data.Games.find(
            i => i.name == game
        ) as import('./types').Game;

        if (Game && !Game.Subscribers.some(item => item == token)) {
            data.Games[data.Games.indexOf(Game)].Subscribers.push(token);
            await doc.set(
                {
                    Games: [...data.Games]
                },
                { merge: true }
            );
        }
    }
    res.status(200).json({ data: { success: true } });
});
