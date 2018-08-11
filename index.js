const GATEWAY = 'localhost:8000'

var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var pump = require('pump')
var websocket = require('websocket-stream')

var storage = () => ram()

module.exports = createHyperStore

function createHyperStore () {
  return hyperstore
}

function hyperstore (state, emitter) {
  state.peers = {
    list: [],
    dict: {}
  }

  emitter.on('hyperstore:start', startGame)
  emitter.on('hyperstore:create', onCreate)
  emitter.on('hyperstore:join', onJoin)
  emitter.on('hyperstore:accept', onAccept)

  function startGame () {
    state.gameStarted = true

    emitter.emit('render')
  }

  function onCreate () {
    var db = hyperdb(storage, { valueEncoding: 'json' })

    db.ready(() => {
      var key = db.key.toString('hex')

      connectToGateway(key, db, err => {
        if (err) return console.error(err)

        console.log('connected to gateway')

        db.watch('/blue', () => {
          db.get('/blue', (err, nodes) => {
            if (err) console.error(err)

            var node = nodes[0]
            if (!node) return

            var log = node.value
            var head = log[0]

            console.log(log, head)

            if (head && head.length && head[0] === 'connect') {
              emitter.emit('hyperstore:start')
            }
          })
        })

        state.discoveryKey = key

        emitter.emit('render')
      })
    })

    state.db = db
    state.player = 'red'
    global.db = db
  }

  function onJoin (remoteKey) {
    var db = hyperdb(storage, remoteKey, { valueEncoding: 'json' })

    db.ready(() => {
      var key = db.key.toString('hex')

      connectToGateway(key, db, err => {
        if (err) return console.error(err)

        db.watch('/red', () => {
          db.get('/red', (err, nodes) => {
            if (err) console.error(err)

            var node = nodes[0]
            if (!node) return

            var log = node.value
            var head = log[0]

            if (head && head.length && head[0] === 'connect') {
              log = []

              log.push(['connect'])

              state.db.put('/blue', log)

              emitter.emit('hyperstore:start')
            }
          })
        })

        state.joined = key
        state.localKey = db.local.key.toString('hex')
        state.key = ''

        emitter.emit('render')
      })
    })

    state.db = db
    state.player = 'blue'
    global.db = db
  }

  function connectToGateway (key, db, cb) {
    var stream = websocket(`ws://${GATEWAY}/db/${key}`)
    var replication = db.replicate({ encrypt: false, live: true })

    stream.on('connect', cb)

    pump(stream, replication, stream, err => {
      console.error('oops', err)
    })
  }

  function onAccept (remoteKey) {
    state.db.authorize(Buffer.from(remoteKey, 'hex'), err => {
      console.log(err || 'authorized')
      var log = []

      log.push(['connect'])

      state.db.put('/red', log)
    })
  }
}
