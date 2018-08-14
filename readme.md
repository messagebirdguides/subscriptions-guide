# SMS Marketing Subscriptions
### ⏱ 30 min build time 

## Why build SMS marketing subscriptions? 

SMS makes it incredibly easy for businesses to reach consumers everywhere at any time, directly on their mobile devices. For many people, these messages are a great way to discover things like discounts and special offers from a company, while others might find them annoying. For this reason, it is  important and also required by law in many countries, to provide clear opt-in and opt-out mechanisms for SMS broadcast lists. To make these work independently of a website it's useful to assign a programmable [virtual mobile number](https://www.messagebird.com/en/numbers) to your SMS campaign and handle incoming messages programmatically so users can control their subscription with basic command keywords.

In this MessageBird Developer Guide, we'll show you how to implement an SMS marketing campaign subscription tool built as a sample application in Node.js.

This application implements the following:
* A person can send the keyword _SUBSCRIBE_ to a specific VMN, that the company includes in their advertising material, to opt in to messages, which is immediately confirmed.
* If the person no longer wants to receive messages they can send the keyword _STOP_ to the same number. Opt-out is also confirmed.
* An administrator can enter a message in a form on a website. Then they can send this message to all confirmed subscribers immediately.

## Getting Started

Since our sample application is built in Node.js, you need to have Node and npm installed on your computer to run it. You can easily [install them both from npmjs.com](https://www.npmjs.com/get-npm).

We've provided the source code of the sample application in the [MessageBird Developer Guides GitHub repository](https://github.com/messagebirdguides/subscriptions-guide), which you can either clone with git or from where you can download a ZIP file with the source code to your computer.

To install the [MessageBird SDK for Node.js](https://www.npmjs.com/package/messagebird) and other dependencies, open a console pointed at the directory into which you've placed the sample application and run the following command:

````bash
npm install
````

The sample application uses [mongo-mock](https://www.npmjs.com/package/mongo-mock) to provide an in-memory database for testing, so you don't need to configure an external database.

## Prerequisites for Receiving Messages

### Overview

This guide describes receiving messages using MessageBird. From a high-level viewpoint, receiving is relatively simple: your application defines a _webhook URL_, which you assign to a number purchased on the MessageBird Dashboard using [Flow Builder](https://dashboard.messagebird.com/en/flow-builder). Whenever someone sends a message to that number, MessageBird collects it and forwards it to the webhook URL, where you can process it.

### Exposing your Development Server with localtunnel

One small roadblock when working with webhooks is the fact that MessageBird needs to access your application, so it needs to be available on a public URL. During development, you're typically working in a local development environment that is not publicly available. Thankfully this is not a big deal since various tools and services allow you to quickly expose your development environment to the Internet by providing a tunnel from a public URL to your local machine. One of these tools is [localtunnel.me](https://localtunnel.me), which is especially suited to NodeJS developers since you can easily install it using npm:

````bash
npm install -g localtunnel
````

You can start a tunnel by providing a local port number on which your application runs. Our sample is configured to run on port 8080, so you can launch your tunnel with this command:

````bash
lt --port 8080
````

After you've launched the tunnel, localtunnel displays your temporary public URL. We'll need that in a minute.

Another common tool for tunneling your local machine is [ngrok](https://ngrok.com), which you can have a look at if you're facing problems with localtunnel.me. It works in virtually the same way.

### Get an Inbound Number

An obvious requirement for receiving messages is an inbound number. Virtual mobile numbers look and work similar to regular mobile numbers, however, instead of being attached to a mobile device via a SIM card, they live in the cloud, i.e., a data center, and can process incoming SMS and voice calls. Explore our low-cost programmable and configurable numbers [here](https://www.messagebird.com/en/numbers).

Here's how to purchase one:

1. Go to the [Numbers](https://dashboard.messagebird.com/en/numbers) section of your MessageBird account and click **Buy a number**.
2. Choose the country in which you and your customers are located and make sure the _SMS_ capability is selected.
3. Choose one number from the selection and the duration for which you want to prepay the amount. ![Buy a number screenshot](/assets/images/screenshots/buy-a-number.png)
4. Confirm by clicking **Buy Number**.

Congratulations, you have set up your first virtual mobile number!

### Connect Number to the Webhook

So you have a number now, but MessageBird has no idea what to do with it. That's why you need to define a _Flow_ next that links your number to your webhook. This is how you do it:

1. On the [Numbers](https://dashboard.messagebird.com/en/numbers) section of your MessageBird account, click the "add new flow" icon next to the number you purchased in the previous step. ![Create Flow, Step 1](/assets/images/screenshots/.png)
2. Choose **Incoming SMS** as the trigger event. ![Create Flow, Step 2](/assets/images/screenshots/create-flow-2.png)
3. Click the small **+** to add a new step to your flow and choose **Forward to URL**. ![Create Flow, Step 3](/assets/images/screenshots/create-flow-3.png)
4. Choose _POST_ as the method, copy the output from the `lt` command in the previous stop and add `/webhook` to it - this is the name of the route we use to handle incoming messages in our sample application. Click **Save**. ![Create Flow, Step 4](/assets/images/screenshots/create-flow-4.png)
5. Hit **Publish Changes** and your flow becomes active! Well done, another step closer to testing incoming messages!

If you have more than one flow, it might be useful to rename it this flow, because _Untitled flow_ won't be helpful in the long run. You can do that by editing the flow and clicking the three dots next to the name and choose **Edit flow name**.

## Configuring the MessageBird SDK

While the MessageBird SDK and an API key are not required to receive messages, it is necessary for sending confirmations and our marketing messages. The SDK is defined in `package.json` and loaded with a statement in `index.js`:

````javascript
// Load and initialize MesageBird SDK
var messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);
````

You need to provide a MessageBird API key, as well as the phone number you registered so that you can use it as the originator, via environment variables. Thanks to [dotenv](https://www.npmjs.com/package/dotenv) you can also supply these through an `.env` file stored next to `index.js`:

````env
MESSAGEBIRD_API_KEY=YOUR-API-KEY
MESSAGEBIRD_ORIGINATOR=+31970XXXXXXX
````

The [API access (REST) tab](https://dashboard.messagebird.com/en/developers/access) in the _Developers_ section of your MessageBird account allows you to create or retrieve a live API key.

## Receiving Messages

Now we're fully prepared for receiving inbound messages, let's have a look at the actual implementation of our `/webhook` route:

````javascript
// Handle incoming webhooks
app.post('/webhook', function(req, res) {
    // Read input sent from MessageBird
    var number = req.body.originator;
    var text = req.body.payload.trim().toLowerCase();
````

The webhook receives some request parameters from MessageBird; however, we're only interested in two of them: the originator, i.e., the number of the user who sent the message, and the payload, i.e., the text of the message. The content is trimmed and converted into lower case so we can easily do case-insensitive command detection.

````javascript
    MongoClient.connect(dbUrl, {}, function(err, db) {
        // Find subscriber in our database
        var subscribers = db.collection('subscribers');
        subscribers.findOne({ number : number }, function(err, doc) {            
````

Using our (fake) MongoDB client, we'll look up the number in a collection aptly named subscribers.

We're looking at three potential cases:
* The user has sent _SUBSCRIBE_ and the number does not exist. The subscriber should be added and opted in.
* The user has submitted _SUBSCRIBE_ and the number exists but has opted out. In that case, it should be opted in (again).
* The user has sent _STOP_ and the number exists and has opted in. In that case, it should be opted out.

For each of those cases, a differently worded confirmation message should be sent. All incoming messages that don't fit any of these cases are ignored and don't get a reply. You can optimize this behavior, for example by sending a help message with all supported commands.

The implementation of each case is similar, so let's look at only one of them here:

````javascript
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
````

If no `doc` (i.e., database entry) exists and the text matches "subscribe", the script executes an insert query that stores a document with the number and the boolean variable `subscribed` set to `true`. The user is notified by calling the `messagebird.messages.create()` SDK method and, as parameters, passing the originator from our configuration, a recipient list with the number from the incoming message and a hardcoded text body.

## Sending Messages

### Showing Form

We've defined a simple form with a single textarea and a submit button, and stored it as a Handlebars template in `views/home.handlebars`. It is rendered for a GET request on the root of the application. As a small hint for the admin, we're also showing the number of subscribers in the database.

### Processing input

The form submits its content as a POST request to the `/send` route. The implementation of this route fetches all subscribers that have opted in from the database and then uses the MessageBird SDK to send a message to them. It is possible to send a message to up to 50 receivers in a single API call, so the script splits a list of subscribers that is longer than 50 numbers (highly unlikely during testing unless you have amassed an impressive collection of phones) into blocks of 50 numbers each. Sending uses the `messagebird.messages.create()` SDK method which you've already seen in the previous section.

Here's the full code block:

````javascript
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
````

### Testing the Application

Double-check that you have set up your number correctly with a flow that forwards incoming messages to a localtunnel URL and that the tunnel is still running. You can restart the tunnel with the `lt` command, but this will change your URL, so you have to update the flow as well.

To start the sample application you have to enter another command, but your existing console window is now busy running your tunnel. Therefore you need to open another one. On a Mac you can press _Command_ + _Tab_ to open a second tab that's already pointed to the correct directory. With other operating systems you may have to resort to manually open another console window. Once you've got a command prompt, type the following to start the application:

````bash
node index.js
````

While keeping the console open, take out your phone, launch the SMS app and send a message to your virtual mobile number with the keyword "subscribe". A few seconds later, you should see some output in the console from the `console.log()` debug statements. Also, the confirmation message should arrive shortly. Point your browser to http://localhost:8080/ (or your tunnel URL) and you should also see that there's one subscriber. Try sending yourself a message now. And voilá, your marketing system is ready!

## Nice work!

You can adapt the sample application for production by replying mongo-mock with a real MongoDB client, deploying the application to a server and providing that server's URL to your flow. Of course, you should add some authorization to the web form. Otherwise, anybody could send messages to your subscribers.

Don't forget to download the code from the [MessageBird Developer Guides GitHub repository](https://github.com/messagebirdguides/subscriptions-guide).

## Next steps

Want to build something similar but not quite sure how to get started? Please feel free to let us know at support@messagebird.com, we'd love to help!
