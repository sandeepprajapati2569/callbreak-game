# Firestore Setup for Friends + Invites

This app now uses Firestore for:
- user profiles
- online presence
- friend requests
- friendships
- game invites

## Collections used
- `users/{uid}`
- `presence/{uid}`
- `friendRequests/{fromUid__toUid}`
- `friendships/{sortedUidA__sortedUidB}`
- `gameInvites/{fromUid__toUid}`

## Firestore rules (starter)
Use this as your baseline in Firebase Console > Firestore Database > Rules:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isSelf(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function isRequestParty(data) {
      return signedIn() && (
        data.fromUid == request.auth.uid ||
        data.toUid == request.auth.uid
      );
    }

    function isFriendshipParty(data) {
      return signedIn() && (
        data.userA == request.auth.uid ||
        data.userB == request.auth.uid
      );
    }

    match /users/{uid} {
      allow read: if signedIn();
      allow create, update: if isSelf(uid);
      allow delete: if false;
    }

    match /presence/{uid} {
      allow read: if signedIn();
      allow create, update: if isSelf(uid);
      allow delete: if false;
    }

    match /friendRequests/{requestId} {
      allow read: if isRequestParty(resource.data);
      allow create: if signedIn()
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.toUid is string
        && request.resource.data.fromUid != request.resource.data.toUid;
      allow update: if isRequestParty(resource.data);
      allow delete: if false;
    }

    match /friendships/{friendshipId} {
      allow read: if isFriendshipParty(resource.data);
      allow create: if signedIn()
        && request.resource.data.userA is string
        && request.resource.data.userB is string
        && request.resource.data.userA != request.resource.data.userB
        && (
          request.resource.data.userA == request.auth.uid ||
          request.resource.data.userB == request.auth.uid
        );
      allow delete: if isFriendshipParty(resource.data);
      allow update: if false;
    }

    match /gameInvites/{inviteId} {
      allow read: if isRequestParty(resource.data);
      allow create: if signedIn()
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.toUid is string
        && request.resource.data.fromUid != request.resource.data.toUid;
      allow update: if isRequestParty(resource.data);
      allow delete: if false;
    }
  }
}
```

## Indexes
Current queries are all simple equality/array-contains queries, so default Firestore indexes are enough.

If Firebase asks for an index, create it from the link in the console error page.

## Important notes
- Guest users cannot use friends/invites.
- Invites expire automatically (2 minutes).
- Presence is heartbeat-based and can show offline if app is backgrounded or disconnected.
