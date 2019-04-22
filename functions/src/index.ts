import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
admin.initializeApp(functions.config().firebase);
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

export const scheduledFunction = functions.pubsub
    .schedule(`every 1 minutes`)
    .onRun(async context => {
        const [got, { authenticate }] = await Promise.all([
            import('got'),
            import('@xboxreplay/xboxlive-auth')
        ]);

        const db = admin.firestore().collection('XBox');
        const [{ userHash, XSTSToken }, docs] = await Promise.all([authenticate(
            functions.config().xbox.usr,
            functions.config().xbox.psw
        ), db.listDocuments()])
        const usrs: import('./types').User[] = [];
        const Games: string[] = [];
        const XUIDs: string[] = []

        const processDoc = async (item: FirebaseFirestore.DocumentReference) => {
            const document = (await item.get()).data() as import('./types').XBoxDBRecord
            document.Games.map(({ name }) => {
                Games.push(name);
            })
            usrs.push({ XUID: document.XUID, username: item.path.replace(/XBox\//, ''), Games: document.Games })
            XUIDs.push(document.XUID);
            return;
        }



        await Promise.all(docs.map(item => processDoc(item)));
        const { body }: { body: import('./types').PresenceResponse[] } = await got.post(
            `https://userpresence.xboxlive.com/users/batch`,
            {
                json: true,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'x-xbl-contract-version': 3,
                    'Authorization': `XBL3.0 x=${userHash};${XSTSToken}`,
                    'Accept-Language': 'en-US',
                },
                body: {
                    onlineOnly: true,
                    users: XUIDs
                }
            }
        );
        body.map(item => {
            const c = usrs.find(a => a.XUID == item.xuid) as import('./types').User
            item.devices.map(({ titles }) => {
                titles.map(({ name }) => {
                    if (Games.includes(name)) {
                        let { Subscribers } = c.Games.find((item) => item.name == name) as import('./types').Game;
                        Subscribers.map((i) => {
                            console.log(`Notifying ${i} about ${name}`)
                            const MSG = admin.messaging()
                            MSG.send({
                                token: i,
                                android: {
                                    notification: {
                                        tag: `MC-${c.username}`,
                                        channelId: 'test-channel'
                                    }
                                },
                                notification: {
                                    title: 'XBox Notifier',
                                    body: `${c.username} is Online on ${name}`
                                }
                            })
                        })
                    }
                })
            })
        })
        return true;
    });

export const AddSubscriber = functions.https
    .onRequest(async (req, res) => {
        const { username, token, game } = req.body.data as { username: string, token: string, game: string }
        const db = admin.firestore().collection('XBox');
        const doc = db.doc(username);
        const document = await doc.get()
        const exists = document.exists;
        if (!exists) {
            const [got] = await Promise.all([
                import('got'),
            ]);
            const {
                body: { xuid }
            } = await got.get(`https://xboxapi.com/v2/xuid/${username}`, {
                json: true,
                headers: {
                    'X-AUTH': functions.config().xbox.api
                }
            });

            doc.create({ XUID: xuid, Games: [{ name: game, Subscribers: [token] }] })
        } else {
            const data = document.data() as import('./types').XBoxDBRecord;
            if (!data.Games.some((item) => item.name == game)) await doc.set({ Games: [...data.Games, { name: game }] }, { merge: true });
            const Game = data.Games.find(i => i.name == game) as import('./types').Game
            if (!Game.Subscribers.some((item) => item == token)) await doc.set({ Games: [...data.Games, { name: game, Subscribers: [...Game.Subscribers, token] }] }, { merge: true });
        }
        res.status(200).json({ data: { success: true } })
    })
