/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const CONNECTION_STRING = process.env.DB;

function getStockData(url, callback) {
  var Http = new XMLHttpRequest();
  Http.onreadystatechange = (e) => {
    if(Http.readyState == 4 && Http.status == 200) {
      callback(Http.responseText);
    }else{
      callback({err: 'Unknown symbol'});
    }
  };
  Http.open("GET", url, false);
  Http.send();  
}

function findAndUpdateData(mongodb, ticker, like, ip, callback) {
  if(like) {
   mongodb.collection("tickers").findOneAndUpdate({stock: ticker}, {$addToSet: {likes: ip}}, {returnOriginal: false, upsert:true}, function(err, docs){
     if(err) console.log(err);
     if(docs) {
       callback(docs.value);
     }else{
       callback({likes: []});
     }
   }); 
  }else {
    mongodb.collection("tickers").findOne({stock: ticker}, function(err, docs) {
      if(err) console.log(err);
      if(docs) {
        callback(docs)
      }else {
        callback({likes: []});
      }
    });
  }
} 

module.exports = function (app) {
  // Set app.set('trust proxy', true) and use req.ip for testing purposes. Otherwise use req.headers['x-forwarded-for']. 
  app.set('trust proxy', true);  

  MongoClient.connect(CONNECTION_STRING, function(err, client) {
    if(err) throw err;
    console.log('Successful database connection!');
    
    // From Stackflow: The callback now returns the client, which has a function called db(dbname) that you must invoke to get the db. 
    var db = client.db('nasdaq');
  
    app.route('/api/stock-prices')
    .get(function(req, res) {
      if(!req.query.stock) { 
        res.json({error: "External source error."});
      }else{
        var like;
        var stock = [];
        var data = [];
        var stockLikes = [];
        //const ip = req.headers['x-forwarded-for'].split(',')[0];
        const ip = req.ip;
        req.query.like ? like = true : like = false;
        typeof(req.query.stock) == "string" ? stock[0] = req.query.stock : stock = req.query.stock.slice(0,2); 
        
        for(var i=0; i<stock.length; i++) {
          var url = 'https://repeated-alpaca.glitch.me/v1/stock/'+stock[i]+'/quote';
          getStockData(url, function(docs) {
            data[i] = JSON.parse(docs);
          });
        }
        
        if(data.includes('Unknown symbol')) {
          res.json({error: "External source error."}); 
        }else{
       
          findAndUpdateData(db, data[0].symbol, like, ip, function(res1) {
            stockLikes[0] = res1.likes.length;
            if(stock.length == 1) {
              res.json({stockData: {stock: data[0].symbol, price: data[0].close, likes: stockLikes[0]} });
            }else{
              findAndUpdateData(db, data[1].symbol, like, ip, function(res2) {
                stockLikes[1] = res2.likes.length;
                res.json({stockData:[{stock: data[0].symbol, price: data[0].close, rel_likes: stockLikes[0]-stockLikes[1]},
                                   {stock: data[1].symbol, price: data[1].close, rel_likes: stockLikes[1]-stockLikes[0]}]}); 
              });
            }
          });
        }
        
      }

      // Moved here otherwise app tests dosn't run properly when connecting the database.
      //404 Not Found Middleware.
      app.use(function(req, res, next) {
        res.status(404)
        .type('text')
        .send('Not Found');
      });
      
    });
    
  });
};