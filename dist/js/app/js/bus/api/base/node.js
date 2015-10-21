var ozpIwc = ozpIwc || {};
ozpIwc.api = ozpIwc.api || {};
ozpIwc.api.base = ozpIwc.api.base || {};
/**
 * @module ozpIwc.api
 * @submodule ozpIwc.api.base
 */


ozpIwc.api.base.Node = (function (api, ozpConfig, util) {
    /**
     * The base class for an api node.
     *
     * @class Node
     * @namespace ozpIwc.api.base
     * @constructor
     * @param {Object} config
     * @param {String} config.resource
     * @param {String[]} config.allowedContentTypes
     * @param {Object} config.entity
     * @param {String} config.contentType
     * @param {Number} config.version
     * @param {String} config.self
     * @param {String} config.serializedEntity
     * @param {String} config.serializedContentType
     */
    var Node = function (config) {
        config = config || {};

        /**
         * @property resource
         * @type String
         */
        this.resource = config.resource;

        /**
         * @property allowedContentTypes
         * @type Array
         */
        this.allowedContentTypes = config.allowedContentTypes;

        /**
         * @property entity
         * @type Object
         */
        this.entity = config.entity;

        /**
         * @property contentType
         * @type String
         */
        this.contentType = config.contentType;

        /**
         * @property uriTemplate
         * @type String
         */
        // used if() to allow for subclasses to set the uriTemplate on the prototype
        // setting the field, even to undefined, would mask the prototype's value
        if (config.uriTemplate) {
            this.uriTemplate = config.uriTemplate;
        }

        /**
         * @property permissions
         * @type Object
         * @default {}
         */
        this.permissions = {};

        /**
         * @property version
         * @type Number
         * @default 0
         */
        this.version = config.version || 1;

        /**
         * @property lifespan
         * @type Boolean
         * @default false
         */
        var lifespanParsed = api.Lifespan.getLifespan(this, config);
        if (lifespanParsed) {
            if (lifespanParsed.type === "Bound" && !lifespanParsed.addresses) {
                lifespanParsed.addresses = [config.src];
            }
            this.lifespan = lifespanParsed;
        } else {
            this.lifespan = new api.Lifespan.Ephemeral();
        }

        /**
         * @property deleted
         * @type Boolean
         * @default true
         */
        this.deleted = false;

        /**
         * String to match for collection.
         * @property pattern
         * @type String
         */
        this.pattern = config.pattern;

        /**
         * @property collection
         * @type Array
         * @default []
         */
        this.collection = [];

        /**
         * @property self - The url backing this node
         * @type String
         */
        this.self = config.self;

        if (config.serializedEntity) {
            this.deserializedEntity(config.serializedEntity, config.serializedContentType);
        }

        if (!this.resource) {
            throw new Error("Base Node requires a resource");
        }
    };

    /**
     * Gathers the self uri from the uriTemplate property if it does not already exist.
     * @method getSelfUri
     * @return {String}
     */
    Node.prototype.getSelfUri = function () {
        if (this.self) {
            return this.self;
        }
        if (this.uriTemplate && api.uriTemplate) {
            var template = api.uriTemplate(this.uriTemplate);
            if (template) {
                this.self = util.resolveUriTemplate(template, this);
            }
        }
        return this.self;
    };

    /**
     * Serialize the node to a form that conveys both persistent and
     * ephemeral state of the object to be handed off to a new API
     * leader.
     *
     * __Intended to be overridden by subclasses__
     * @method serializeLive
     * @return {Object}
     */
    Node.prototype.serializeLive = function () {
        return this.toPacket({
            deleted: this.deleted,
            pattern: this.pattern,
            collection: this.collection,
            lifespan: this.lifespan,
            allowedContentTypes: this.allowedContentTypes,
            _links: {
                self: {href: this.self}
            }
        });
    };

    /**
     * Set the node using the state returned by serializeLive.
     *
     * __Intended to be overridden by subclasses__
     *
     * @method deserializeLive
     * @param {Object} serializedForm The data returned from serializeLive
     * @return {Object} the content type of the serialized data
     */
    Node.prototype.deserializeLive = function (serializedForm, serializedContentType) {
        serializedForm.contentType = serializedForm.contentType || serializedContentType;
        this.set(serializedForm);
        if (serializedForm._links && serializedForm._links.self) {
            this.self = serializedForm._links.self.href;
        }
        if (!this.resource) {
            this.resource = serializedForm.resource || this.resourceFallback(serializedForm);
        }
        this.deleted = serializedForm.deleted;
        this.lifespan = serializedForm.lifespan;
        this.allowedContentTypes = serializedForm.allowedContentTypes;
        this.pattern = serializedForm.pattern;
        this.collection = serializedForm.collection;
    };


    /**
     * If a resource path isn't given, this takes the best guess at assigning it.
     * Overriden by subclasses.
     *
     * @method deserializeResourceFromContentType
     * @param serializedForm
     */
    Node.prototype.deserializeResourceFromContentType = function (serializedForm) {
        if (serializedForm._links && serializedForm._links.self) {
            this.resource = serializedForm._links.self.href.replace(ozpConfig.apiRootUrl, "");
        }
    };

    /**
     * Serializes the node for persistence to the server.
     *
     * __Intended to be overridden by subclasses__
     *
     * @method serializedEntity
     * @return {String} a string serialization of the object
     */
    Node.prototype.serializedEntity = function () {
        return JSON.stringify(this.entity);
    };

    /**
     * The content type of the data returned by serializedEntity()
     *
     * __Intended to be overridden by subclasses__
     *
     * @method serializedContentType
     * @return {String} the content type of the serialized data
     */
    Node.prototype.serializedContentType = function () {
        return this.contentType;
    };

    /**
     * Sets the api node from the serialized form.
     *
     * __Intended to be overridden by subclasses__
     *
     * @method serializedEntity
     * @param {String} serializedForm A string serialization of the object
     * @param {String} contentType The contentType of the object
     * @return {Object}
     */
    Node.prototype.deserializedEntity = function (serializedForm, contentType) {
        if (typeof(serializedForm) === "string") {
            serializedForm = JSON.parse(serializedForm);
        }
        this.entity = serializedForm;
        this.contentType = contentType;
        if (this.entity && this.entity._links) {
            var links = this.entity._links;
            if (!this.self && links.self) {
                this.self = links.self.href;
            }
            if (!this.resource) {
                if (links["ozp:iwcSelf"]) {
                    this.resource = links["ozp:iwcSelf"].href.replace(/web\+ozp:\/\/[^/]+/, "");
                } else {
                    this.resource = this.resourceFallback(serializedForm);
                }
            }
        }
    };


    /**
     * If a resource path isn't given, this takes the best guess at assigning it.
     * @method resourceFallback
     * @param serializedForm
     */
    Node.prototype.resourceFallback = function (serializedForm) {
        // do nothing, override if desired.
    };

    /**
     * Turns this value into a packet.
     *
     * @method toPacket
     * @param {ozpIwc.packet.Transport} [base] Fields to be merged into the packet.
     * @return {ozpIwc.packet.Transport}
     */
    Node.prototype.toPacket = function (base) {
        base = base || {};
        base.entity = util.clone(this.entity);
        base.lifespan = this.lifespan;
        base.contentType = this.contentType;
        base.permissions = this.permissions;
        base.eTag = this.version;
        base.resource = this.resource;
        base.pattern = this.pattern;
        base.collection = this.collection;
        return base;
    };


    /**
     * Sets a data based upon the content of the packet.  Automatically updates the content type,
     * permissions, entity, and updates the version.
     *
     * @method set
     * @param {ozpIwc.packet.Transport} packet
     */
    Node.prototype.set = function (packet) {
        if (!Array.isArray(packet.permissions)) {
            for (var i in packet.permissions) {
                //If a permission was passed, wipe its value and set it to the new value;
                this.permissions.clear(i);
                this.permissions.pushIfNotExist(i, packet.permissions[i]);
            }
        }
        this.lifespan = api.Lifespan.getLifespan(this, packet) || this.lifespan;
        this.contentType = packet.contentType;
        this.entity = packet.entity;
        this.pattern = packet.pattern || this.pattern;
        this.deleted = false;
        if (packet.eTag) {
            this.version = packet.eTag;
        } else {
            this.version++;
        }
    };

    /**
     * Clears the entity of the node and marks as deleted.
     * @method markAsDeleted
     * @param {ozpIwc.packet.Transport} packet
     */
    Node.prototype.markAsDeleted = function (packet) {
        this.version++;
        this.deleted = true;
        this.entity = null;
        this.pattern = null;
        this.collection = null;
    };

    /**
     * Adds a new watcher based upon the contents of the packet.
     *
     * @method addWatch
     * @param {ozpIwc.packet.Transport} watch
     */
    Node.prototype.addWatch = function (watch) {
        this.watchers.push(watch);
    };

    /**
     * Removes all watchers who's packet matches that which is passed in.
     * @method removeWatch
     * @param {ozpIwc.packet.Transport} filter
     */
    Node.prototype.removeWatch = function (filter) {
        this.watchers = this.watchers.filter(filter);
    };


    /**
     * Generates a point-in-time snapshot of this value that can later be sent to
     * {@link ozpIwc.CommonApiValue#changesSince} to determine the changes made to the value.
     * This value should be considered opaque to consumers.
     *
     * <p> For API subclasses, the default behavior is to simply call toPacket().  Subclasses
     * can override this, but should likely override {@link ozpIwc.CommonApiValue#changesSince}
     * as well.
     *
     * @method snapshot
     * @return {ozpIwc.packet.Transport}
     */
    Node.prototype.snapshot = function () {
        return this.toPacket();
    };

    /**
     * From a given snapshot, create a change notifications.  This is not a delta, rather it's
     * change structure.
     * <p> API subclasses can override if there are additional change notifications.
     *
     * @method changesSince
     * @param {object} snapshot The state of the value at some time in the past.
     * @return {Object} A record of the current value and the value of the snapshot.
     */
    Node.prototype.changesSince = function (snapshot) {
        if (snapshot.eTag === this.version) {
            return null;
        }
        return {
            'newValue': this.toPacket(),
            'oldValue': snapshot
        };
    };

    return Node;
}(ozpIwc.api, ozpIwc.config, ozpIwc.util));
