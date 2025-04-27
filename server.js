require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const { DateTime } = require('luxon');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let quotaUsed = 0;

// Reset quota every midnight PST
function scheduleQuotaReset() {
  const now = DateTime.now().setZone('America/Los_Angeles');
  let nextMidnight = now.plus({ days: 1 }).startOf('day');
  const timeout = nextMidnight.diff(now).as('milliseconds');

  console.log(`🔄 Scheduling API quota reset in ${(timeout / 1000 / 60).toFixed(1)} minutes (at ${nextMidnight.toISO()})`);

  setTimeout(() => {
    quotaUsed = 0;
    console.log('🔄 API quota reset to 0 (Midnight PST)');
    scheduleQuotaReset(); // Reschedule again properly
  }, timeout);
}

scheduleQuotaReset();

async function fetchVideoDetails(videoId) {
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(apiUrl);
  quotaUsed += 1;
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0];
  }
  throw new Error('Video details not found');
}

app.get('/api/stream-info', async (req, res) => {
  try {
    let apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=live&order=date&maxResults=5&key=${YOUTUBE_API_KEY}`;
    let response = await fetch(apiUrl);
    quotaUsed += 100;
    let data = await response.json();

    let videoId = null;

    if (data.items && data.items.length > 0) {
      videoId = data.items[0].id.videoId;
    } else {
      apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=upcoming&order=date&maxResults=5&key=${YOUTUBE_API_KEY}`;
      response = await fetch(apiUrl);
      quotaUsed += 100;
      data = await response.json();

      if (data.items && data.items.length > 0) {
        let upcomingVideos = data.items;
        let details = await Promise.all(
            upcomingVideos.map(async (item) => {
              const detail = await fetchVideoDetails(item.id.videoId);
              quotaUsed += 1;
              return {
                videoId: item.id.videoId,
                title: detail.snippet.title,
                scheduledStartTime: detail.liveStreamingDetails?.scheduledStartTime || null,
                liveChatId: detail.liveStreamingDetails?.activeLiveChatId || null,
                quotaUsed
              };
            })
        );

        details.sort((a, b) => {
          return new Date(a.scheduledStartTime) - new Date(b.scheduledStartTime);
        });

        const next = details[0];
        return res.json({
          title: next.title,
          scheduledStartTime: next.scheduledStartTime,
          liveChatId: next.liveChatId,
          quotaUsed
        });
      } else {
        return res.status(404).json({ error: 'No live or upcoming streams found.' });
      }
    }

    const liveDetails = await fetchVideoDetails(videoId);
    quotaUsed += 1;

    return res.json({
      title: liveDetails.snippet.title,
      scheduledStartTime: liveDetails.liveStreamingDetails?.scheduledStartTime || null,
      liveChatId: liveDetails.liveStreamingDetails?.activeLiveChatId || null,
      quotaUsed
    });

  } catch (error) {
    console.error('Error fetching stream info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/live-chat', async (req, res) => {
  const { liveChatId, pageToken, maxResults } = req.body;

  if (!liveChatId) {
    return res.status(400).json({ error: 'Missing liveChatId' });
  }

  try {
    let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
    quotaUsed += 1;

    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    return res.json({
      messages: data.items || [],
      nextPageToken: data.nextPageToken || null,
      pollingIntervalMillis: data.pollingIntervalMillis || null,
      quotaUsed
    });
  } catch (error) {
    console.error('Error fetching live chat messages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
