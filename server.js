require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/albet', { useNewUrlParser: true, useUnifiedTopology: true });

// User schema and model
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    settings: Object
});
const User = mongoose.model('User', userSchema);

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Session middleware setup
app.use(session({
    secret: process.env.SESSION_SECRET, // Ensure this is a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// Configure Passport with Google strategy
passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/callback"
    },
    function(accessToken, refreshToken, profile, done) {
        return done(null, { provider: 'google', profile });
    }
));

// Configure Passport with Discord strategy
passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/discord/callback",
        scope: ['identify', 'email']
    },
    function(accessToken, refreshToken, profile, done) {
        return done(null, { provider: 'discord', profile });
    }
));

// Serialize and deserialize user
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

// Routes for Google login
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    function(req, res) {
        res.redirect('/dashboard');
    });

// Routes for Discord login
app.get('/auth/discord',
    passport.authenticate('discord', { scope: ['identify', 'email'] }));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    function(req, res) {
        res.redirect('/dashboard');
    });

// Guest login route
app.get('/auth/guest', (req, res) => {
    // Generate a random number for the guest username
    const randomNum = Math.floor(Math.random() * 10000); // Generates a number between 0 and 9999
    const guest = {
        provider: 'guest',
        profile: {
            displayName: `Guest#${randomNum}`, // Guest username in Guest#number format
            email: null, // No email for guest
            profilePic: 'https://ohsobserver.com/wp-content/uploads/2022/12/Guest-user.png' // Guest profile picture
        }
    };

    // Log the guest user in
    req.login(guest, (err) => {
        if (err) {
            console.error('Error logging in as guest:', err);
            return res.redirect('/');
        }
        res.redirect('/dashboard');
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }

    const user = req.user;
    let profilePic, username, email;

    if (user.provider === 'google') {
        profilePic = user.profile._json.picture;
        username = user.profile.displayName;
        email = user.profile._json.email;
    } else if (user.provider === 'discord') {
        profilePic = `https://cdn.discordapp.com/avatars/${user.profile.id}/${user.profile.avatar}.png?size=1024`;
        username = user.profile.username;
        email = user.profile.email;
    } else if (user.provider === 'guest') {
        profilePic = user.profile.profilePic;
        username = user.profile.displayName;
        email = null;
    }

    res.render('dashboard', { profilePic, username, email });
});

// Save settings route
app.post('/save-settings', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).send('Unauthorized');
    }
    User.findByIdAndUpdate(req.user.id, { settings: req.body }, (err, user) => {
        if (err) {
            return res.status(500).send('Error saving settings');
        }
        res.send('Settings saved');
    });
});

// Load settings route
app.get('/load-settings', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).send('Unauthorized');
    }
    res.send(req.user.settings);
});

// Logout route
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return next(err); 
        }
        res.redirect('/');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Start the server
server.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
