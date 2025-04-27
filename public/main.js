let configValues = {};
let liveChatId = null;
let startTime = null;
let stopTime = null;
let pollTimer = null;
let pollingInterval = null;
let nextPageToken = null;
let votes = {};
let voters = new Set();
let pollingActive = false;

// DOM elements
const startButton = document.getElementById('startButton');
const configToggleBtn = document.querySelector('.toggle-config');
const configContent = document.querySelector('.config-content');
const resultsContent = document.getElementById('resultsContent');
const quotaDisplay = document.getElementById('quotaDisplay');
const supportedEmotes = new Set([
    'runieBUGGY',
    'runieCHEERS',
    'runieCOPE',
    'runieDESKKUN',
    'runieHEADPAT',
    'runieHMPH',
    'runieIDOL',
    'runieKISS',
    'runieLOVELOVE',
    'runieOtaku',
    'runiePERONA',
    'runieRUHUHU',
    'runieSMUG',
    'runieSOB',
    'runieUwow',
    'runieWOTA',
    'runieYAP'
]);
// Config fields
const configFields = [
    'totalTime',
    'pollRate',
    'uniqueOnly',
    'votesRequired',
    'maxDisplayed',
    'membersOnly',
    'superChatExponent',
    'chatsPerAPI'
];

// Clamp utility function
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Clamp numeric inputs on typing
configFields.forEach(id => {
    const el = document.getElementById(id);

    if (el.type === 'number') {
        el.addEventListener('input', () => {
            const min = parseFloat(el.min) || -Infinity;
            const max = parseFloat(el.max) || Infinity;
            const val = parseFloat(el.value);

            if (!isNaN(val)) {
                el.value = clamp(val, min, max);
            }
        });
    }
});

configFields.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', saveConfigToCookies);
    if (el.type === 'checkbox') {
        el.addEventListener('change', saveConfigToCookies); // still listen to checkbox changes
    }
});

function saveConfigToCookies() {
    const configToSave = {};
    configFields.forEach(id => {
        const el = document.getElementById(id);
        configToSave[id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    document.cookie = `pollingConfig=${encodeURIComponent(JSON.stringify(configToSave))}; path=/; max-age=31536000`; // 1 year
}

function loadConfigFromCookies() {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});

    if (cookies.pollingConfig) {
        try {
            const config = JSON.parse(decodeURIComponent(cookies.pollingConfig));
            configFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = config[id];
                    } else {
                        el.value = config[id];
                    }
                }
            });
        } catch (error) {
            console.error('Failed to parse config from cookies:', error);
        }
    } else {
        document.getElementById('loadLive').click();
    }
}

// Toggle config visibility
configToggleBtn.addEventListener('click', () => {
    const isVisible = configContent.style.display === 'block';
    configContent.style.display = isVisible ? 'none' : 'block';
    configToggleBtn.innerHTML = `Config ${isVisible ? '&#9660;' : '&#9650;'}`;
});

// Live/Test preset loaders
document.getElementById('loadLive').addEventListener('click', () => {
    applyConfigPreset({
        totalTime: 300,
        pollRate: 0,
        uniqueOnly: true,
        votesRequired: 3,
        maxDisplayed: 4,
        superChatExponent: 0,
        membersOnly: false,
        chatsPerAPI: 2000
    });
    saveConfigToCookies();
});

document.getElementById('loadTest').addEventListener('click', () => {
    applyConfigPreset({
        totalTime: 60,
        pollRate: 5,
        uniqueOnly: false,
        votesRequired: 1,
        maxDisplayed: 20,
        membersOnly: false,
        superChatExponent: 3.1,
        chatsPerAPI: 500
    });
    saveConfigToCookies();
});

function applyConfigPreset(preset) {
    document.getElementById('totalTime').value = preset.totalTime;
    document.getElementById('pollRate').value = preset.pollRate;
    document.getElementById('uniqueOnly').checked = preset.uniqueOnly;
    document.getElementById('votesRequired').value = preset.votesRequired;
    document.getElementById('maxDisplayed').value = preset.maxDisplayed;
    document.getElementById('membersOnly').checked = preset.membersOnly;
    document.getElementById('superChatExponent').value = preset.superChatExponent;
    document.getElementById('chatsPerAPI').value = preset.chatsPerAPI;
}

// Start/Stop button
startButton.addEventListener('click', () => {
    if (!pollingActive) {
        startPolling();
    } else {
        stopPolling();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    loadConfigFromCookies();
    fetchLivestreamTitle();
});

async function fetchLivestreamTitle() {
    try {
        const res = await fetch('/api/stream-info');
        const data = await res.json();

        if (data.title) {
            const titleElem = document.querySelector('.title');
            titleElem.textContent = `Polling "${data.title}"`;
            liveChatId = data.liveChatId || null;
            console.log('✅ liveChatId:', liveChatId);
            updateQuotaDisplay(data.quotaUsed);
        } else {
            console.warn('Stream info not found');
        }
    } catch (error) {
        console.error('Error fetching livestream info:', error);
    }
}

function startPolling() {
    if (!liveChatId) {
        alert('No live stream available.');
        return;
    }

    startButton.textContent = 'Stop';
    startButton.style.backgroundColor = '#dc3545';
    startButton.style.border = '2px solid white';
    pollingActive = true;

    resultsContent.innerHTML = '';
    votes = {};
    voters.clear();
    nextPageToken = null;

    configValues = {
        totalTime: parseInt(document.getElementById('totalTime').value) || 300,
        pollRate: parseInt(document.getElementById('pollRate').value) || 0,
        uniqueOnly: document.getElementById('uniqueOnly').checked,
        votesRequired: parseInt(document.getElementById('votesRequired').value) || 3,
        maxDisplayed: parseInt(document.getElementById('maxDisplayed').value) || 4,
        membersOnly: document.getElementById('membersOnly').checked,
        superChatExponent: parseFloat(document.getElementById('superChatExponent').value) || 0,
        chatsPerAPI: parseInt(document.getElementById('chatsPerAPI').value) || 2000
    };

    startTime = new Date();
    stopTime = new Date(startTime.getTime() + configValues.totalTime * 1000);

    pollChat();
}

function stopPolling() {
    startButton.textContent = 'Start';
    startButton.style.backgroundColor = '#28a745';
    startButton.style.border = '2px solid white';
    pollingActive = false;

    if (pollTimer) {
        clearTimeout(pollTimer);
    }
}

async function pollChat() {
    if (!pollingActive) return;

    try {
        const res = await fetch('/api/live-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                liveChatId: liveChatId,
                pageToken: nextPageToken,
                maxResults: configValues.chatsPerAPI
            })
        });

        const data = await res.json();

        if (data.messages) {
            processMessages(data.messages);
            updateDisplay();
            nextPageToken = data.nextPageToken;
        }
        updateQuotaDisplay(data.quotaUsed);

        const now = new Date();
        if (now >= stopTime) {
            stopPolling();
            return;
        }

        const waitTime = Math.max(configValues.pollRate*1000, data.pollingIntervalMillis);
        pollTimer = setTimeout(pollChat, waitTime);

    } catch (error) {
        console.error('Error polling chat:', error);
        stopPolling();
    }
}

function processMessages(messages) {
    messages.forEach(message => {
        const snippet = message.snippet;
        const author = message.authorDetails;

        if (!snippet || !author) return;

        const isSuperChat = snippet.type === 'superChatEvent';
        const isTextMessage = snippet.type === 'textMessageEvent';

        if (!isSuperChat && !isTextMessage) return;

        const publishedAt = new Date(snippet.publishedAt);
        if (publishedAt < startTime) return;

        if (configValues.membersOnly && !author.isChatSponsor && !isSuperChat) return;
        if (configValues.uniqueOnly && voters.has(author.channelId) && !isSuperChat) return;

        let messageText = snippet.displayMessage || '';
        messageText = messageText.trim().toLowerCase();
        if (!messageText) return;
        let displayText = snippet.displayMessage || '';

        if (isSuperChat && messageText.includes('"')) {
            const match = messageText.match(/"([^"]+)"/);
            if (match) {
                messageText = match[1];
                displayText = match[1];
            }
        }

        let weight = 1;
        if (isSuperChat && snippet.superChatDetails) {
            const tier = snippet.superChatDetails.tier;
            weight = Math.pow(tier, configValues.superChatExponent);
        }

        if (!votes[messageText]) {
            votes[messageText] = { weight: weight, displayText: displayText };
        }
        else{
            votes[messageText].weight += weight;
            voters.add(author.channelId);
        }
    });
}

function replaceEmotes(text) {
    text = text.replace(/:(?!_)([a-zA-Z0-9-]+):/g, '');

    return text.replace(/:_([a-zA-Z0-9]+):/g, (match, emoteName) => {
        if (supportedEmotes.has(emoteName)) {
            return `<img src="/emotes/${emoteName}.png" alt="${emoteName}" width="24" height="24" style="vertical-align:middle;">`;
        }
        return ''; // Remove unknown :_something: too
    });
}


// Update displayed results
function updateDisplay() {
    const sortedVotes = Object.values(votes)
        .filter(v => v.weight >= configValues.votesRequired)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, configValues.maxDisplayed);

    resultsContent.innerHTML = '';

    const totalWeight = sortedVotes.reduce((sum, v) => sum + v.weight, 0);

    sortedVotes.forEach(vote => {
        const percentage = totalWeight > 0 ? (vote.weight / totalWeight) * 100 : 0;

        const line = document.createElement('div');
        line.style.position = 'relative';
        line.style.marginBottom = '5px';
        line.style.overflow = 'hidden';
        line.style.borderRadius = '8px';
        line.style.backgroundColor = '#333'; // fallback background

        const background = document.createElement('div');
        background.style.position = 'absolute';
        background.style.top = 0;
        background.style.left = 0;
        background.style.height = '100%';
        background.style.width = `${percentage}%`;
        background.style.backgroundColor = '#4caf50'; // green highlight
        background.style.opacity = '0.3'; // make it a soft overlay

        const content = document.createElement('div');
        content.style.position = 'relative';
        content.style.padding = '5px 10px';
        content.style.zIndex = '1';
        content.style.color = 'white';
        content.innerHTML = `${replaceEmotes(vote.displayText)} - ${percentage.toFixed(1)}%`;

        line.appendChild(background);
        line.appendChild(content);
        resultsContent.appendChild(line);
    });
}

function updateQuotaDisplay(used) {
    quotaDisplay.textContent = `${used}/10000`;
}

