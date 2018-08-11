// signaling server
const PORT = 8000

var express = require('express')
var expressWS = require('express-ws')
var websocketStream = require('websocket-stream/stream')
var ram = require('random-access-memory')
var hyperdb = require('hyperdb')
var swarm = require('hyperdiscovery')
var pump = require('pump')

var app = express()
var dbs = {}

expressWS(app)

app.ws('/db/:key', wsDB)
app.ws('/players/:key', wsPlayers)
app.listen(PORT, () => console.log('listening at', PORT))

function wsPlayers (ws, req) {

}

function wsDB (ws, req) {
  var { key } = req.params
  var db

  if (dbs[key]) {
    console.log('existing key')
    db = dbs[key].db
    dbs[key].lastAccess = Date.now()
  } else {
    console.log('new key')
    db = hyperdb(ram, key)
    dbs[key] = {
      db,
      lastAccess: Date.now(),
      clients: 0,
      localKeys: []
    }

    db.on('ready', handleNew)

    db.list(() => {
      console.log('list')
    })
  }

  db.ready(() => {
    dbs[key].clients += 1
    console.log('ready to pump', dbs[key].clients)

    var stream = websocketStream(ws)
    var replication = db.replicate({ encrypt: false, live: true })

    pump(stream, replication, stream, err => {
      console.log('pipe finished', err, err.message)

      dbs[key].clients -= 1
    })
  })

  function handleNew () {
    var sw = swarm(db)

    dbs[key].swarm = sw

    sw.on('connection', (peer, info) => {
      console.log('Swarm connection', info)
    })

    var watcher = db.watch(() => {
      console.log('something changed in', key)
    })

    watcher.on('error', err => {
      console.error('Watcher error', err)
    })
  }
}
