// Load dependencies
var express = require('express');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');
var MongoClient = require('mongo-mock').MongoClient;

// Load configuration from .env file
require('dotenv').config();

// This is the MongoDB URL. It does not actually exist
// but our mock requires a URL that looks "real".
var dbUrl = "mongodb://localhost:27017/myproject";

// Load and initialize MesageBird SDK
var messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);

// Set up and configure the Express framework
var app = express();
app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');
app.use(bodyParser.urlencoded({ extended : true }));

// Handle incoming webhooks
app.post('/webhook', function(req, res) {
    // Read input sent from MessageBird
    var number = req.body.originator;
    var text = req.body.payload.trim().toLowerCase();

    MongoClient.connect(dbUrl, {}, function(err, db) {
        // Find subscriber in our database
        var subscribers = db.collection('subscribers');
        subscribers.findOne({ number : number }, function(err, doc) {            
            if (doc == null && text == "subscribe") {
                // The user has sent the "subscribe" keyword
                // and is not stored in the database yet, so
                // we add them to the database.
                subscribers.insertOne({
                    number : number,
                    subscribed : true
                }, function(err, result) {
                    console.log("subscribed number", err, result);
                });

                // Notify the user
                messagebird.messages.create({
                    originator : process.env.MESSAGEBIRD_ORIGINATOR,
                    recipients : [ number ],
                    body : "Thanks for subscribing to our list! Send STOP anytime if you no longer want to receive messages from us."
                }, function (err, response) {
                    console.log(err, response);
                });
            }
            if (doc != null && doc.subscribed == false && text == "subscribe") {
                // The user has sent the "subscribe" keyword
                // and was already found in the database in an
                // unsubscribed state. We resubscribe them by
                // updating their database entry.
                subscribers.updateOne({
                    number : number
                }, {
                    $set: {
                        subscribed : true
                    }
                }, function(err, result) {
                    console.log("resubscribed number", err, result);
                });

                // Notify the user
                messagebird.messages.create({
                    originator : process.env.MESSAGEBIRD_ORIGINATOR,
                    recipients : [ number ],
                    body : "Thanks for re-subscribing to our list! Send STOP anytime if you no longer want to receive messages from us."
                }, function (err, response) {
                    console.log(err, response);
                });
            }
            if (doc != null && doc.subscribed == true && text == "stop") {
                // The user has sent the "stop" keyword, indicating
                // that they want to unsubscribe from messages.
                // They were found in the database, so we mark
                // them as unsubscribed and update the entry.
                subscribers.updateOne({
                    number : number
                }, {
                    $set: {
                        subscribed : false
                    }
                }, function(err, result) {
                    console.log("unsubscribed number", err, result);
                });

                // Notify the user
                messagebird.messages.create({
                    originator : process.env.MESSAGEBIRD_ORIGINATOR,
                    recipients : [ number ],
                    body : "Sorry to see you go! You will not receive further marketing messages from us."
                }, function (err, response) {
                    console.log(err, response);
                });
            }
        });
    });

    // Return any response, MessageBird won't parse this
    res.send("OK");
});

app.get('/', function(req, res) {
    MongoClient.connect(dbUrl, {}, function(err, db) {
        // Get number of subscribers to show on the form
        var subscribers = db.collection('subscribers');
        subscribers.count({ subscribed : true }, function(err, count) { 
            // Render form
            res.render('home', { count : count });
        });
    });
});

app.post('/send', function(req, res) {
    // Read input from user
    var message = req.body.message;

    MongoClient.connect(dbUrl, {}, function(err, db) {
        // Get number of subscribers to show on the form
        var subscribers = db.collection('subscribers');
        subscribers.find({ subscribed : true }, {}).toArray(function(err, docs) {
            // Collect all numbers
            var recipients = [];
            var count = 0;
            for (var d in docs) {
                recipients.push(docs[d].number);
                count = parseInt(d)+1;
                if (count == docs.length || count % 50 == 0) {
                    // We have reached either the end of our list or 50 numbers,
                    // which is the maximum that MessageBird accepts in a single
                    // API call, so we send the message and then, if any numbers
                    // are remaining, start a new list
                    messagebird.messages.create({
                        originator : process.env.MESSAGEBIRD_ORIGINATOR,
                        recipients : recipients,
                        body : message
                    }, function (err, response) {
                        console.log(err, response);
                    });
                    recipients = [];
                }
            }

            res.render('sent', { count : count });
        });
    });
});

// Start the application
app.listen(8080);