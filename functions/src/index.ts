import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  PresenceResponse,
  Game,
  User as UserRecord,
  Subscribers
} from './types';
import { ProcessUser } from './Users';

admin.initializeApp(functions.config().firebase);

let Users: import('./types').User[] = []; // The array used for storing User data within this execution

/*
const ProcessDocuments = async (doc: FirebaseFirestore.DocumentReference) => {
    let document = await doc.get();
    if(!document.exists) return;
    let data = document.data() as XBoxDBRecord;
    Users.push({
        XUID: data.XUID,
        username: doc.path.replace(/XBox\//, ''),
        Games: data.Games,
        notified: data.notified
    });
    XUIDs.push(data.XUID);
    return;
}; */

const ProcessUserPresence = async (item: PresenceResponse): Promise<void> => {
  let user = Users.find(a => a.XUID === item.xuid) as UserRecord;
  if (item.devices)
    item.devices.map(({ titles }) =>
      titles.map(({ name }) => {
        if (!user.Games.some(b => b.name == name)) return;
        const { Subscribers } = user.Games.find(
          item => item.name == name
        ) as Game;
        Subscribers.map(async usr => {
          console.log(usr);
          if (!usr.notified)
            await SendNotification({
              token: usr.token,
              name,
              username: user.username
            });
          return;
        });
      })
    );
  else {
    if (item.lastSeen) {
      if (!user.Games.some(b => b.name == item.lastSeen.titleName)) return;
      const { Subscribers } = user.Games.find(
        i => i.name == item.lastSeen.titleName
      ) as Game;
      Subscribers.map(async usr => {
        if (usr.notified)
          await SetNotified(
            user.username,
            usr.token,
            item.lastSeen.titleName,
            false
          );
      });
    }
  }
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
  console.log(token);
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

  SetNotified(username, token, name, true);

  //await SetNotified(username, true);
};

export const scheduledFunction = functions.pubsub
  .schedule(`every 1 minutes`)
  .retryConfig({})
  .onRun(async context => {
    Users = [];
    const [got, { authenticate }] = await Promise.all([
      import('got'),
      import('@xboxreplay/xboxlive-auth')
    ]);

    let db = admin.firestore().collection('XBox'); // The Firebase Firestore for storing Users subscription data.
    let [{ userHash, XSTSToken }, docs2] = await Promise.all([
      authenticate(functions.config().xbox.usr, functions.config().xbox.psw),
      db.get()
    ]);
    const XUIDs: string[] = [];
    await Promise.all(docs2.docs.map(usr => ProcessUser(usr, Users, XUIDs)));
    //await Promise.all(docs.map(item => ProcessDocuments(item)));
    const { body }: { body: PresenceResponse[] } = await got.post(
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
  });

const SetNotified = async (
  username: string,
  subscriber: string,
  name: string,
  notified: boolean
) => {
  const user = Users.find(usr => usr.username == username) as UserRecord;
  const game = user.Games.find(gm => gm.name == name) as Game;
  const GM = user.Games.indexOf(game);
  const SB = user.Games[GM].Subscribers.indexOf(user.Games[GM].Subscribers.find(
    a => a.token == subscriber
  ) as Subscribers);
  user.Games[GM].Subscribers[SB].notified = notified;
  console.log(user);
  await admin
    .firestore()
    .collection('XBox')
    .doc(username)
    .set(
      {
        Games: [...user.Games]
      },
      {
        merge: true
      }
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
      Games: [{ name: game, Subscribers: [{ token, notified: false }] }]
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

    const Game = data.Games.find(i => i.name == game) as import('./types').Game;

    if (Game && !Game.Subscribers.some(({ token: tkn }) => tkn == token)) {
      data.Games[data.Games.indexOf(Game)].Subscribers.push({
        token,
        notified: false
      });
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
