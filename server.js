const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const ROOT = __dirname;
const INVITATION_FILE = path.join(ROOT, "wedding.html");
const SONG_FILE = path.join(ROOT, "mysong.mp3");

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_RECIPIENT = process.env.WHATSAPP_RECIPIENT || "966556175626";

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}

function sendFile(res, filePath, contentType) {
    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendJson(res, 404, { error: "File not found" });
            return;
        }

        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

async function sendWhatsappMessage(members) {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        throw new Error("Missing WhatsApp Cloud API credentials");
    }

    const memberLabel = members === 1 ? "1 member" : `${members} members`;
    const payload = {
        messaging_product: "whatsapp",
        to: WHATSAPP_RECIPIENT,
        type: "text",
        text: {
            body: `Wedding RSVP confirmation: ${memberLabel} will attend.`
        }
    };

    const response = await fetch(
        `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WhatsApp API error: ${errorText}`);
    }
}

function collectRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1e6) {
                reject(new Error("Request body too large"));
            }
        });

        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
        sendFile(res, INVITATION_FILE, "text/html; charset=utf-8");
        return;
    }

    if (req.method === "GET" && req.url === "/wedding.html") {
        sendFile(res, INVITATION_FILE, "text/html; charset=utf-8");
        return;
    }

    if (req.method === "GET" && req.url === "/mysong.mp3") {
        sendFile(res, SONG_FILE, "audio/mpeg");
        return;
    }

    if (req.method === "POST" && req.url === "/api/rsvp") {
        try {
            const rawBody = await collectRequestBody(req);
            const payload = JSON.parse(rawBody || "{}");
            const members = Number(payload.members);

            if (!Number.isInteger(members) || members < 1 || members > 20) {
                sendJson(res, 400, { error: "Members must be an integer between 1 and 20" });
                return;
            }

            await sendWhatsappMessage(members);
            sendJson(res, 200, { ok: true });
        } catch (error) {
            console.error(error);
            sendJson(res, 500, { error: error.message || "Failed to process RSVP" });
        }
        return;
    }

    sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
    console.log(`Wedding invitation server running at http://${HOST}:${PORT}`);
});
