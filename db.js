/**
 * Simple JSON file database. No native compilation needed.
 * Data is stored in data.json in this folder.
 */
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");
const { v4: uuid } = require("uuid");

const adapter = new FileSync(path.join(__dirname, "data.json"));
const db = low(adapter);

db.defaults({
  clients: [],
  calls: [],
  appointments: [],
  messages: [],
  demos: [],
  salesOutcomes: [],
}).write();

module.exports = {
  saveClient(client) {
    const existing = db.get("clients").find({ id: client.id }).value();
    if (existing) {
      db.get("clients").find({ id: client.id }).assign(client).write();
    } else {
      db.get("clients").push({ ...client, createdAt: new Date().toISOString() }).write();
    }
  },

  getClient(id) {
    const client = db.get("clients").find({ id }).value();
    if (!client) throw new Error(`Client not found: ${id}`);
    return client;
  },

  getAllClients() {
    return db.get("clients").value();
  },

  logCall(clientId, call) {
    db.get("calls").push({ id: uuid(), clientId, ...call, createdAt: new Date().toISOString() }).write();
  },

  logAppointment(clientId, appt) {
    db.get("appointments").push({ id: uuid(), clientId, ...appt, status: "confirmed", createdAt: new Date().toISOString() }).write();
  },

  logMessage(clientId, msg) {
    db.get("messages").push({ id: uuid(), clientId, ...msg, read: false, createdAt: new Date().toISOString() }).write();
  },

  logDemoBooked(params) {
    db.get("demos").push({ id: uuid(), ...params, status: "scheduled", createdAt: new Date().toISOString() }).write();
  },

  logSalesOutcome(params) {
    db.get("salesOutcomes").push({ id: uuid(), ...params, createdAt: new Date().toISOString() }).write();
  },

  getStats(clientId) {
    const calls = db.get("calls").filter({ clientId }).value();
    const appts = db.get("appointments").filter({ clientId }).value();
    const msgs = db.get("messages").filter({ clientId, read: false }).value();
    return {
      calls: calls.length,
      totalDuration: calls.reduce((s, c) => s + (c.duration || 0), 0),
      appointments: appts.length,
      unreadMessages: msgs.length,
    };
  },
};
