const { SSL_OP_EPHEMERAL_RSA } = require('constants');

var express = require('express'),
    async = require('async'),
    pg = require('pg'),
    { Pool } = require('pg'),
    path = require('path'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);
    crypto = require("crypto");
    https = require('http');
    redis = require("redis");

io.set('transports', ['polling']);
rclient = redis.createClient({
  host: 'redis',
  password: 'redis'
});
rclient.on('error', err => {
  console.log('Error ' + err);
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
} 


function rand_string(n) {
  if (n <= 0) {
      return '';
  }
  var rs = '';
  try {
      rs = crypto.randomBytes(Math.ceil(n/2)).toString('hex').slice(0,n);
      /* note: could do this non-blocking, but still might fail */
  }
  catch(ex) {
      /* known exception cause: depletion of entropy info for randomBytes */
      console.error('Exception generating random string: ' + ex);
      /* weaker random fallback */
      rs = '';
      var r = n % 8, q = (n-r)/8, i;
      for(i = 0; i < q; i++) {
          rs += Math.random().toString(16).slice(2);
      }
      if(r > 0){
          rs += Math.random().toString(16).slice(2,i);
      }
  }
  return rs;
}


var port = process.env.PORT || 8080;

io.sockets.on('connection', function (socket) {

  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    
    
    socket.join(data.channel);
    
  });
  
  socket.on('results', (arg) => {
    console.log(arg);
    //var bc = 'jtsolarcal'; 
    options = {
      hostname: 'bluegreen',
      port: 80,
      path: '/results/route/testbg/rhgame/'+arg,
      method: 'GET'
    };
    req = https.request(options, res => {
      console.log(`statusCode: ${res.statusCode}`)
    
      res.on('data', d => {
        process.stdout.write(d)
      })
    });
    req.on('error', error => {
      console.error(error)
    });
    
    req.end();
    
  });

  socket.on('countdown', (arg) => {
    console.log("adding random votes");
    var addonvote = Math.floor(Math.random() * 2);
    var vote = (addonvote==0) ? 'a' : 'b';
    var voter_id = rand_string(6);
    for(i =0; i<999; i++){
     var data="{'voter_id': "+voter_id+", 'vote': "+vote+"}";
     console.log("pushing: "+data)
     rclient.rpush('votes', data);
     sleep(1000);
    }
  }); 
});



var pool = new pg.Pool({
  connectionString: 'postgres://postgres:postgres@db/postgres'
});

async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      //console.log("sending"+JSON.stringify(votes));
      io.sockets.emit("scores", JSON.stringify(votes));

    }

    setTimeout(function() {getVotes(client) }, 2000);
  });
}

function collectVotesFromResult(result) {
  var votes = {a: 0, b: 0};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

app.use(cookieParser());
app.use(bodyParser());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
  next();
});

app.use(express.static(__dirname + '/views'));

app.get('/', function (req, res) {
  res.sendFile(path.resolve(__dirname + '/views/index.html'));
});



server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
