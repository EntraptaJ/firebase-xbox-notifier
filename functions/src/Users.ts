import { User as UserRecord, XBoxDBRecord } from './types';

export const ProcessUser = async (User: FirebaseFirestore.QueryDocumentSnapshot, Users: UserRecord[], X2: string[]) => {
    let data = User.data() as XBoxDBRecord;
    X2.push(data.XUID);
    Users.push({
        username: User.ref.path.replace(/XBox\//, ''),
        ...data,
    })
}