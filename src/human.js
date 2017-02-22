var {EventEmitter} = require('events')
var _ = require('./_')
var util = require('./util')
var hash = require('./hash')

module.exports = class extends EventEmitter {
  constructor(sock) {
    Object.assign(this, {
      isBot: false,
      isConnected: false,
      isReadyToStart: true,
      id: sock.id,
      ip: sock.ip,
      name: sock.name,
      time: 0,
      packs: [],
      autopick_index: -1,
      pool: [],
      cap: {
        packs: {}
      },
      picks: []
    })
    this.attach(sock)
  }
  get isActive() {
    // Note that a player can be transmuted into a bot when they are kicked.
    return this.isConnected && !this.isBot
  }
  attach(sock) {
    if (this.sock && this.sock !== sock)
      this.sock.ws.close()

    sock.mixin(this)
    sock.on('readyToStart', this._readyToStart.bind(this))
    sock.on('autopick', this._autopick.bind(this))
    sock.on('pick', this._pick.bind(this))
    sock.on('hash', this._hash.bind(this))
    sock.once('exit', this._farewell.bind(this))

    var [pack] = this.packs
    if (pack)
      this.send('pack', pack)
    this.send('pool', this.pool)
  }
  err(message) {
    this.send('error', message)
  }
  _hash(deck) {
    if (!util.deck(deck, this.pool))
      return

    this.hash = hash(deck)
    this.emit('meta')
  }
  _farewell() {
    this.isConnected = false
    this.emit('meta')
  }
  _readyToStart(value) {
    this.isReadyToStart = value
    this.emit('meta')
  }
  _autopick(index) {
    var [pack] = this.packs
    if (pack && index < pack.length)
      this.autopick_index = index
  }
  _pick(index) {
    var [pack] = this.packs
    if (pack && index < pack.length)
      this.pick(index)
  }
  getPack(pack) {
    if (this.packs.push(pack) === 1)
      this.sendPack(pack)
  }
  sendPack(pack) {
    if (pack.length === 1)
      return this.pick(0)

    if (this.useTimer)
      //this.time = this.timerLength + pack.length
      // http://www.wizards.com/contentresources/wizards/wpn/main/documents/magic_the_gathering_tournament_rules_pdf1.pdf pp43
      // official WOTC timings are
      // pick #, time in seconds)
      //(1,40)(2,40)(3,35)(4,30)(5,25)(6,25)(7,20)(8,20)(9,15)(10,10)(11,10)(12,5)(13,5)(14,5)(15,0)
      var officialTimes = [40,40,35,30,25,25,20,20,15,10,10,5,5,5]
      if (pack.length + this.picks.length > 14) {
        for (var x = 0; x < ((pack.length + this.picks.length) - 14); x++) {
          officialTimes.splice(6, 0, 20)
        }
      }
      this.time = (this.timerLength - 1) + officialTimes[this.picks.length]

    this.send('pack', pack)
  }
  pick(index) {
    var pack = this.packs.shift()
    var card = pack.splice(index, 1)[0]

    var pickcard = card.name
    if (card.foil == true)
      pickcard = '*' + pickcard + '*'

    this.pool.push(card)
    this.picks.push(pickcard)
    this.send('add', card.name)

    var [next] = this.packs
    if (!next)
      this.time = 0
    else
      this.sendPack(next)

    this.autopick_index = -1
    this.emit('pass', pack)
  }
  pickOnTimeout() {
    let index = this.autopick_index
    if (index === -1)
      index = _.rand(this.packs[0].length)
    this.pick(index)
  }
  kick() {
    this.send = ()=>{}
    while(this.packs.length)
      this.pickOnTimeout()
    this.sendPack = this.pickOnTimeout
    this.isBot = true
  }
}
