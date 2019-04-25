import { User as UserRecord, XBoxDBRecord } from './types';

let XUIDs: string[];

export const ProcessUser = async (User: FirebaseFirestore.QueryDocumentSnapshot, Users: UserRecord[]) => {
    let data = User.data() as XBoxDBRecord;
    Users.push({
        username: User.ref.path.replace(/XBox\//, ''),
        ...data,
    })
    XUIDs.push(data.XUID);
    return XUIDs;
}