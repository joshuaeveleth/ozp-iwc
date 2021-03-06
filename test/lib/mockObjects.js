/* jshint unused:false */
// TestParticipant, FakePeer, and FakeRouter are used elsewhere.

//========================================================
// Fake peer that just stores the packets that it receives
//========================================================
var FakePeer = function () {
    this.events = new ozpIwc.util.Event();

    this.events.mixinOnOff(this);

    this.packets = [];
    this.send = function (packet) {
        this.packets.push(packet);
    };
};

//========================================================
// TestParticipant for connecting to a router
//========================================================
var TestParticipant = ozpIwc.util.extend(ozpIwc.transport.participant.Client, function (config) {
    config = config || {};
    this.sentPacketObjs = [];
    this.packets = [];
    this.activeStates = config.activeStates || {
            'leader': true,
            'member': false,
            'election': false,
            'queueing': false
        };

    this.metrics = new ozpIwc.metric.Registry();
    this.origin = config.origin || "foo.com";
    // since we aren't connecting to a router, mock these out, too
    this.metricRoot = "testparticipant";
    this.participantType = "testParticipant";
    this.sentPacketsMeter = this.metrics.meter(this.metricRoot, "sentPackets");
    this.receivedPacketsMeter = this.metrics.meter(this.metricRoot, "receivedPackets");
    this.forbiddenPacketsMeter = this.metrics.meter(this.metricRoot, "forbiddenPackets");

    // mock common permission attributes (that would be assigned on router/multicast connections)
    ozpIwc.transport.participant.Client.apply(this, arguments);


    this.router = {
        'send': function () {
        }
    };
});

TestParticipant.prototype.receiveFromRouter = function (packet) {
    this.packets.push(packet);
    return ozpIwc.transport.participant.Client.prototype.receiveFromRouter.call(this, packet);
};

TestParticipant.prototype.sendImpl = function (packet, callback) {
    this.sentPacketObjs.push(packet);
    try {
        packet = ozpIwc.transport.participant.Client.prototype.send.call(this, packet, callback);
    } catch (e) {
        packet = e;
    }
    // tick to trigger the async send
    ozpIwc.testUtil.tick(0);
};

TestParticipant.prototype.reply = function (originalPacket, packet, callback) {
    packet.ver = packet.ver || originalPacket.ver || 1;
    packet.src = packet.src || originalPacket.dst || this.address;
    packet.dst = packet.dst || originalPacket.src;// || config.dst;
    packet.msgId = packet.msgId || this.messageId++;
    packet.time = packet.time || new Date().getTime();

    packet.replyTo = originalPacket.msgId;

    packet.action = packet.action || originalPacket.action;
    packet.resource = packet.resource || originalPacket.resource;

    this.sentPacketObjs.push(packet);

    if (callback) {
        this.callbacks[packet.msgId] = callback;
    }
    if (this.router) {
        this.router.send(packet, this);
    }
    return packet;
};


var TestClientParticipant = ozpIwc.util.extend(TestParticipant, function () {
    var config = arguments[0] || {};
    config.name = config.name || "fakeName";
    config.router = config.router || new FakeRouter();

    TestParticipant.call(this, config);
    this.participantType = "testClientParticipant";
});


//================================================
// Packetbuilders for testing API classes
//================================================
var TestPacketContext = ozpIwc.util.extend(ozpIwc.transport.PacketContext, function () {
    ozpIwc.transport.PacketContext.apply(this, arguments);
    var self = this;
    this.responses = [];
    this.router = {
        send: function (packet) {
            self.responses.push(packet);
        }
    };
});
//================================================
// Fake Router
//================================================
var FakeRouter = function () {
    this.jitter = 0;
    this.events = new ozpIwc.util.Event();
    this.events.mixinOnOff(this);
    this.packetQueue = [];
    this.participants = [];
    this.send = function (packet) {
//        				console.log("Sending(" + packet.src + "): ",packet);

        if (this.packetQueue.length === 0 || Math.random() > this.jitter) {
            this.packetQueue.push(packet);
        } else {
//				console.log("JITTER!");
            this.packetQueue.splice(-1, 0, packet);
        }

    };
    this.registerParticipant = function (p) {
        p.connectToRouter(this, (this.participants.length + 1) + ".fake");
        this.participants.push(p);
        return p.address;
    };
    this.pump = function () {
        var processed = 0;
        var recvFn = function (participants, packet) {
            participants.forEach(function (l) {
                if (l.address !== packet.src) {
                    l.receiveFromRouter(new TestPacketContext({'packet': packet}));
                }
            });
        };
        while (this.packetQueue.length) {
            processed++;
            var packet = this.packetQueue.shift();
//				console.log("PACKET(" + packet.src + "): ",packet);
            recvFn(this.participants, packet);
        }
        return processed;
    };
    this.createMessage = function (m) {
        return m;
    };
    this.registerMulticast = function (participant, groups) {
        var self = this;
        groups.forEach(function (groupName) {
            var g = self.participants[groupName];
            if (!g) {
                g = self.participants[groupName] = new ozpIwc.transport.participant.Multicast({
                    name: groupName,
                    authorization: ozpIwc.wiring.authorization,
                    metrics: new ozpIwc.metric.Registry()
                });
            }
            g.addMember(participant);
            if (participant.address) {
                var registeredEvent = new ozpIwc.util.CancelableEvent({
                    'entity': {'group': groupName, 'address': participant.address}
                });
                participant.permissions.pushIfNotExist('ozp:iwc:sendAs', groupName);
                participant.permissions.pushIfNotExist('ozp:iwc:receiveAs', groupName);

                self.events.trigger("registeredMulticast", registeredEvent);
            } else {
                ozpIwc.log.log("no address for " + participant.participantType + " " + participant.name + "with address " + participant.address + " for group " + groupName);
            }
            //ozpIwc.log.log("registered " + participant.participantType + " " + participant.name + "with address " +
            // participant.address + " for group " + groupName);
        });
    };

};
