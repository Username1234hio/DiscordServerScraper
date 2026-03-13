PLEASE READ THIS BEFORE RUNNING THE BOT AND WONDERING WHY IT ISNT WORKING
1. Download the bot.js and the package.json, and put them into a folder
2. Run "npm install"
3. Create a bot at https://discord.com/developers/applications
4. New Application → Bot → Reset Token → copy it
5. Enable Server Members Intent and Emoji Intent under Privileged Gateway Intents
6. Invite the bot with scopes: bot + applications.commands and permission: Administrator
7. Paste the Token into the "const TOKEN = 'YOUR_BOT_TOKEN_HERE';" part in bot.js
8. Run "npm start"
9. invite the bot to your server
10. run the script and it should generate the csv files (/export)
