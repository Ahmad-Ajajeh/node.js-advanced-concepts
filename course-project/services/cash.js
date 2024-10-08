const util = require("util");

const redis = require("redis");
const mongoose = require("mongoose");

const redisUrl = "redis://127.0.0.1:6379";
const client = redis.createClient(redisUrl);
client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options = {}) {
  this.useCache = true;

  this.hashKey = JSON.stringify(options.key || "default");

  return this;
};

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name,
    })
  );

  // See if we have a value for 'key' in redis
  const cacheValue = await client.hget(this.hashKey, key);

  // If we do, return than
  if (cacheValue) {
    const doc = JSON.parse(cacheValue);
    return Array.isArray(doc)
      ? doc.map((d) => new this.model(d))
      : new this.model(doc);
  }

  // Otherwise, issue the query and store the result in redis .
  const result = await exec.apply(this, arguments);
  client.hset(this.hashKey, key, JSON.stringify(result));

  return result;
};

// this.getQuery : {find: x, limit: y, populate: z};
// this.mongooseCollection.name : Blog
// new this.model: create a model isntance .

exports.clearHash = function (hashKey) {
  client.del(JSON.stringify(hashKey));
};
