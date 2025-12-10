/**
 * Open Eyes Vote - Backend Server
 * Node.js + Express + MongoDB
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/brewvote';

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB Connected');
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

// ===== SCHEMAS =====

const userSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    name: String,
    employeeId: { type: String, unique: true, required: true },
    role: { type: String, enum: ['EMPLOYEE', 'ADMIN'], required: true },
    createdAt: { type: Date, default: Date.now }
});

const voteSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    sessionId: { type: String, required: true },
    userId: { type: String, required: true },
    userName: String,
    type: { type: String, enum: ['COFFEE', 'TEA'], required: true },
    timestamp: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    startTime: { type: Date, required: true },
    endTime: Date,
    isActive: { type: Boolean, default: true },
    totalVotes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Vote = mongoose.model('Vote', voteSchema);
const Session = mongoose.model('Session', sessionSchema);

// ===== ROUTES =====

// Initialize Admin User
app.post('/api/init', async (req, res) => {
    try {
        const adminExists = await User.findOne({ employeeId: 'ADM001' });
        if (!adminExists) {
            await User.create({
                id: 'admin-1',
                name: 'Event Manager',
                employeeId: 'ADM001',
                role: 'ADMIN'
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== AUTH ROUTES =====

app.post('/api/auth/login', async (req, res) => {
    try {
        const { employeeId, name, role } = req.body;

        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID required' });
        }

        if (role === 'ADMIN') {
            // Admin login
            const admin = await User.findOne({ employeeId, role: 'ADMIN' });
            if (!admin) {
                return res.status(401).json({ error: 'Invalid admin credentials' });
            }
            return res.json(admin);
        } else {
            // Employee login/register
            let user = await User.findOne({ employeeId, role: 'EMPLOYEE' });

            if (!user && name) {
                // Register new employee
                const newUser = {
                    id: require('crypto').randomUUID(),
                    name,
                    employeeId,
                    role: 'EMPLOYEE'
                };
                user = await User.create(newUser);
            }

            if (!user) {
                return res.status(401).json({ error: 'User not found. Please provide name for first login.' });
            }

            return res.json(user);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== USER ROUTES =====

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== SESSION ROUTES =====

app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await Session.find().sort({ createdAt: -1 });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sessions/active', async (req, res) => {
    try {
        // For non-admin users, never return an active session
        if (req.query.userId) {
            const user = await User.findOne({ id: req.query.userId });
            if (!user || user.role !== 'ADMIN') {
                return res.json(null);
            }
        }
        
        const session = await Session.findOne({ isActive: true });
        res.json(session || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/start', async (req, res) => {
    try {
        // Check if user is admin
        const user = await User.findOne({ id: req.query.userId });
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admins can start sessions' });
        }

        // Deactivate all active sessions
        await Session.updateMany({ isActive: true }, { isActive: false });

        // Create new session
        const newSession = {
            id: require('crypto').randomUUID(),
            startTime: new Date(),
            isActive: true,
            totalVotes: 0,
            createdBy: user.id
        };

        const session = await Session.create(newSession);
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/:id/end', async (req, res) => {
    try {
        const session = await Session.findOneAndUpdate(
            { id: req.params.id },
            { isActive: false, endTime: new Date() },
            { new: true }
        );
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== VOTE ROUTES =====

app.get('/api/votes', async (req, res) => {
    try {
        const votes = await Vote.find();
        res.json(votes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/votes/session/:sessionId', async (req, res) => {
    try {
        const votes = await Vote.find({ sessionId: req.params.sessionId });
        res.json(votes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/votes', async (req, res) => {
    try {
        const { sessionId, userId, userName, type } = req.body;

        if (!sessionId || !userId || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user already voted in this session
        const existingVote = await Vote.findOne({ sessionId, userId });
        if (existingVote) {
            return res.status(400).json({ error: 'User already voted in this session' });
        }

        const newVote = {
            id: require('crypto').randomUUID(),
            sessionId,
            userId,
            userName,
            type,
            timestamp: new Date()
        };

        const vote = await Vote.create(newVote);

        // Update session total votes
        await Session.findOneAndUpdate(
            { id: sessionId },
            { $inc: { totalVotes: 1 } }
        );

        res.json(vote);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== STATS ROUTES =====

app.get('/api/stats', async (req, res) => {
    try {
        const votes = await Vote.find();
        const coffeeTotal = votes.filter(v => v.type === 'COFFEE').length;
        const teaTotal = votes.filter(v => v.type === 'TEA').length;

        res.json({
            coffeeTotal,
            teaTotal,
            totalVotes: votes.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== START SERVER =====

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
