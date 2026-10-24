# SHAGGY XMD v5

- `/`      Home: live wallpaper, live stats chart, free pairing
- `/pro`   Pro pair page: WhatsApp number + payment slip, slip goes to owner automatically
- Slips are saved in `./slips` and re-sent every 45s if no bot was connected at upload time.

## .env
- `SLIP_RECEIVERS=94713836073,94784224161`  (numbers that receive slips; defaults to OWNER_NUMBERS)
- `PM2_NAME=shaggy-xmd`
- `FFMPEG_PATH=/path/to/ffmpeg` (optional, for .csong visualizer)

## v5 branding
- `LOGO_URL` (pair.js config) = logo used on menu, alive and on every text reply (small logo card).
- `brandcard.js` adds the logo card to text replies. Turn off with `.env` `LOGO_CARD=false`.

## v5 stable changes
- All "seen" features removed (ALWAYS_MSG_SEEN, STATUS_VIEW, READ_CMD and every readMessages call). Old values in the DB are ignored.
- New v5 logo on every command reply (`brandcard.js`): text, image, video and document replies get a preview card. `.env`: `LOGO_CARD_SIZE=auto|large|small`, `LOGO_CARD=false` to disable.
- Old logo link saved in the DB (BOT_IMAGE) is migrated to the new logo automatically.
- Home page: "Live anime office" scene (character mood follows live server status) + interactive live analytics chart.
