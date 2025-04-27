# Rune Poll

A 1 click arbitrary vote youtube chat poller

Note: Expect 1-3 seconds of lag at all times. Its simply the nature of this implementation
due to the two way client communication with the server and server communication with youtube

The site is configured using environment variables. Set the following in your .env file,
or the actual environment of your server process:
- `CHANNEL_ID=XXXX` sets the youtube channel to check for streams and chats. Copy only
  the part after /channel/ in the URL (i.e. the `UC...` part)
- `YOUTUBE_API_KEY=XXXX` for getting the data from youtube. Can be created for free at
  https://console.cloud.google.com/apis/api/youtube.googleapis.com/credentials

## Configuration Options
- `Total Poll Time` the total time after which the polling will automatically stop
- `Poll Update Rate` the maximum requested update rate. Youtube demands a minimum polling
   speed that is significant, so if this item is less than that, the rate is determined
   by Youtube. Can set to 0 unless you want to be extra nice to the server. Network speed
   also slows this down as mentioned above. 
- `Unique Only` if enabled, if a user votes for something non-unique (i.e. already said)
   their votes are prevented for the remaining duration of the poll, except superchats.
   Disabling this option will allow spamming the poll. 
- `Votes to Display` the minimum vote weight required to be an eligible option for display.
- `Max Displayed` the maximum amount of lines permitted in the results box, sorted by weight.
- `Members Only` if enabled, only members votes count, except superchats.
   Discriminate against the poor with a single click!
- `Super Chat Exponent` modified the superchat weight by tier^exponent - see chart
<pre>
   ----------------------------------
   |        |  0  |  1  |  2  |  3  |
   ----------------------------------
   |$1  (1) |  no characters N/A    |
   ----------------------------------
   |$2  (2) |  1  |  2  |  4  |  6  |
   ----------------------------------
   |$5  (3) |  1  |  3  |  9  | 27  |
   ----------------------------------
   |$10 (4) |  1  |  4  | 16  | 64  |
   ----------------------------------
   |$20 (5) |  1  |  5  | 25  | 125 |
   ----------------------------------
   |$50 (6) |  1  |  6  | 36  | 228 |
   ----------------------------------
   |$100(7) |  1  |  7  | 49  | 343 |
   ----------------------------------
</pre>
   3.1 is the correct solution to scale weight of the vote proportional to the USD spent.
   However this can drown out the rest of chat. Also does not convert currency, so ARS spam
   could be a problem. Using a number >0, <3.1 may encourage lower super chat tiers. 
- `Chats/API call` Maximum amount of chats youtube may return for a single API call. 
   Set to 2000, it causes no issues and if lowered with a fast chat messages may be missed
- `API Quota` Lies to you. Reset when the server restarts so is not accurate, but can give
   an indication that the server is doing something so thats pretty neat.