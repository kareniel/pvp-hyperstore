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
  emitter.on('DOMContentLoaded', () => {
    emitter.on('hyperstore:create', onCreate)
    emitter.on('hyperstore:join', onJoin)
    emitter.on('hyperstore:accept', onAccept)
  })

  function onCreate () {
    var db = hyperdb(storage, { valueEncoding: 'json' })

    db.ready(() => {
      var key = db.key.toString('hex')

      connectToGateway(key, db, err => {
        if (err) return console.error(err)

        console.log('connected to gateway')

        db.watch('/blue', () => {
          console.log('blue db updated:', db.key.toString('hex'))
        })

        state.discoveryKey = key

        emitter.emit('render')
      })
    })

    state.db = db
    global.db = db
  }

  function onJoin (remoteKey) {
    var db = hyperdb(storage, remoteKey, { valueEncoding: 'json' })

    db.ready(() => {
      console.log('db is ready')
      var key = db.key.toString('hex')

      connectToGateway(key, db, err => {
        if (err) return console.error(err)

        console.log('connected to gateway')

        db.watch('/red', () => {
          console.log('red db updated:', db.key.toString('hex'))
        })

        state.joined = key
        state.localKey = db.local.key.toString('hex')
        state.key = ''

        emitter.emit('render')
      })
    })

    state.db = db
    global.db = db
  }

  function onAccept (remoteKey) {
    state.db.authorize(Buffer.from(remoteKey, 'hex'), err => {
      console.log(err || 'authorized')
    })
  }

  function connectToGateway (key, db, cb) {
    var stream = websocket(`ws://${GATEWAY}/db/${key}`)
    var replication = db.replicate({ encrypt: false, live: true })

    stream.on('connect', cb)

    pump(stream, replication, stream, err => {
      console.error('oops', err)
    })
  }
}
