export default class PartySession {
  constructor({
    id,
    leaderUid,
    gameType = 'callbreak',
    targetSize = 4,
    createdAt = Date.now(),
  }) {
    this.id = id
    this.leaderUid = leaderUid
    this.status = 'forming' // forming | ready | queueing | launching | in_match | disbanded
    this.gameType = gameType === 'donkey' ? 'donkey' : 'callbreak'
    this.targetSize = Math.min(Math.max(Number(targetSize) || 4, 2), 5)
    this.createdAt = createdAt
    this.updatedAt = createdAt
    this.version = 1
    this.members = []
    this.pendingInvites = []
    this.voiceParticipants = new Set()
    this.currentRoomCode = null
    this.matchmaking = null
  }

  addMember({
    uid,
    name = 'Player',
    photoURL = null,
    socketId = null,
    role = 'member',
    ready = false,
    connected = true,
    joinedAt = Date.now(),
  }) {
    const existing = this.members.find((member) => member.uid === uid)
    if (existing) {
      existing.name = name || existing.name
      existing.photoURL = photoURL ?? existing.photoURL
      existing.socketId = socketId ?? existing.socketId
      existing.connected = Boolean(connected)
      existing.ready = Boolean(ready)
      existing.lastSeenAt = Date.now()
      if (role) existing.role = role
      this.bumpVersion()
      return existing
    }

    const member = {
      uid,
      name: name || 'Player',
      photoURL: photoURL || null,
      role,
      ready: Boolean(ready),
      connected: Boolean(connected),
      socketId: socketId || null,
      joinedAt,
      lastSeenAt: Date.now(),
    }
    this.members.push(member)
    this.bumpVersion()
    return member
  }

  removeMember(uid) {
    const index = this.members.findIndex((member) => member.uid === uid)
    if (index === -1) return null
    const [removed] = this.members.splice(index, 1)
    this.voiceParticipants.delete(uid)
    this.pendingInvites = this.pendingInvites.filter((invite) => invite.toUid !== uid)
    this.bumpVersion()
    return removed
  }

  getMember(uid) {
    return this.members.find((member) => member.uid === uid) || null
  }

  getConnectedMembers() {
    return this.members.filter((member) => member.connected)
  }

  setLeader(uid) {
    this.leaderUid = uid
    this.members = this.members.map((member) => ({
      ...member,
      role: member.uid === uid ? 'leader' : 'member',
    }))
    this.bumpVersion()
  }

  transferLeaderIfNeeded() {
    const currentLeader = this.getMember(this.leaderUid)
    if (currentLeader?.connected) return currentLeader

    const nextLeader = this.members
      .filter((member) => member.connected)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0] || null

    if (!nextLeader) return null
    this.setLeader(nextLeader.uid)
    return nextLeader
  }

  setReady(uid, ready) {
    const member = this.getMember(uid)
    if (!member) return null
    member.ready = Boolean(ready)
    this.bumpVersion()
    return member
  }

  markConnected(uid, socketId) {
    const member = this.getMember(uid)
    if (!member) return null
    member.connected = true
    member.socketId = socketId || member.socketId
    member.lastSeenAt = Date.now()
    this.bumpVersion()
    return member
  }

  markDisconnected(uid) {
    const member = this.getMember(uid)
    if (!member) return null
    member.connected = false
    member.socketId = null
    member.ready = false
    member.lastSeenAt = Date.now()
    this.voiceParticipants.delete(uid)
    this.bumpVersion()
    return member
  }

  canLaunch() {
    const connected = this.getConnectedMembers()
    if (connected.length === 0) return false
    if (connected.length > this.targetSize) return false
    return connected.every((member) => member.ready)
  }

  clearReadyStates() {
    this.members.forEach((member) => {
      member.ready = false
    })
    this.bumpVersion()
  }

  setStatus(status) {
    this.status = status
    this.bumpVersion()
  }

  setCurrentRoomCode(roomCode) {
    this.currentRoomCode = roomCode || null
    this.bumpVersion()
  }

  setMatchmaking(payload = null) {
    this.matchmaking = payload
      ? {
          queueKey: payload.queueKey || null,
          position: Number(payload.position) || 0,
          total: Number(payload.total) || 0,
          queuedAt: Number(payload.queuedAt) || Date.now(),
        }
      : null
    this.bumpVersion()
  }

  bumpVersion() {
    this.version += 1
    this.updatedAt = Date.now()
  }

  toJSON() {
    return {
      partyId: this.id,
      leaderUid: this.leaderUid,
      status: this.status,
      gameType: this.gameType,
      targetSize: this.targetSize,
      currentRoomCode: this.currentRoomCode || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
      memberUids: this.members.map((member) => member.uid),
      matchmaking: this.matchmaking
        ? {
            queueKey: this.matchmaking.queueKey || null,
            position: Number(this.matchmaking.position) || 0,
            total: Number(this.matchmaking.total) || 0,
            queuedAt: Number(this.matchmaking.queuedAt) || null,
          }
        : null,
      members: this.members.map((member) => ({
        uid: member.uid,
        name: member.name,
        photoURL: member.photoURL || null,
        role: member.role,
        ready: Boolean(member.ready),
        connected: Boolean(member.connected),
        joinedAt: member.joinedAt || null,
        lastSeenAt: member.lastSeenAt || null,
      })),
      pendingInvites: this.pendingInvites.map((invite) => ({
        id: invite.id,
        fromUid: invite.fromUid,
        toUid: invite.toUid,
        fromName: invite.fromName || 'Player',
        toName: invite.toName || 'Player',
        status: invite.status,
        createdAt: invite.createdAt,
        updatedAt: invite.updatedAt,
        expiresAt: invite.expiresAt,
      })),
      voiceParticipants: Array.from(this.voiceParticipants),
    }
  }

  static fromSnapshot(snapshot = {}) {
    const party = new PartySession({
      id: snapshot.partyId,
      leaderUid: snapshot.leaderUid,
      gameType: snapshot.gameType || 'callbreak',
      targetSize: snapshot.targetSize || 4,
      createdAt: snapshot.createdAt || Date.now(),
    })

    party.status = snapshot.status || 'forming'
    party.currentRoomCode = snapshot.currentRoomCode || null
    party.updatedAt = snapshot.updatedAt || Date.now()
    party.version = Number(snapshot.version) || 1
    party.matchmaking = snapshot.matchmaking
      ? {
          queueKey: snapshot.matchmaking.queueKey || null,
          position: Number(snapshot.matchmaking.position) || 0,
          total: Number(snapshot.matchmaking.total) || 0,
          queuedAt: Number(snapshot.matchmaking.queuedAt) || Date.now(),
        }
      : null

    if (Array.isArray(snapshot.members)) {
      party.members = snapshot.members.map((member) => ({
        uid: member.uid,
        name: member.name || 'Player',
        photoURL: member.photoURL || null,
        role: member.role || (member.uid === snapshot.leaderUid ? 'leader' : 'member'),
        ready: Boolean(member.ready),
        connected: Boolean(member.connected),
        socketId: null,
        joinedAt: member.joinedAt || Date.now(),
        lastSeenAt: member.lastSeenAt || Date.now(),
      }))
    }

    if (Array.isArray(snapshot.pendingInvites)) {
      party.pendingInvites = snapshot.pendingInvites.map((invite) => ({
        id: invite.id,
        fromUid: invite.fromUid,
        toUid: invite.toUid,
        fromName: invite.fromName || 'Player',
        toName: invite.toName || 'Player',
        status: invite.status || 'pending',
        createdAt: invite.createdAt || Date.now(),
        updatedAt: invite.updatedAt || Date.now(),
        expiresAt: invite.expiresAt || Date.now(),
      }))
    }

    if (Array.isArray(snapshot.voiceParticipants)) {
      party.voiceParticipants = new Set(snapshot.voiceParticipants.filter(Boolean))
    }

    return party
  }
}
