const express = require('express');
const app = express();
const Sequelize = require('sequelize');
const { UUID, UUIDV4, STRING } = Sequelize;
const conn = new Sequelize(process.env.DATABASE_URL || 'postgres://localhost/leaderboard_db');
const redis = require('redis');
console.log(process.env.REDIS_URL);
const client = redis.createClient({ url: process.env.REDIS_URL });

app.get('/leaderboard/', async(req, res, next)=> {
  try {
    const game = await Game.findOne();
    res.send(await game.leaderboard());
  }
  catch(ex){
    next(ex);
  }
});

const User = conn.define('user', {
  id: {
    type: UUID,
    defaultValue: UUIDV4,
    primaryKey: true
  },
  name: {
    type: STRING
  }
});

const Game = conn.define('game', {
  id: {
    type: UUID,
    defaultValue: UUIDV4,
    primaryKey: true
  }
});


Game.prototype.leaderboard = async function(){
  const response = await client.sendCommand(['ZREVRANGE', `leaderboard-${this.id}`, '0', '2', 'WITHSCORES']); 
  return response;
}

const Point = conn.define('point', {
  id: {
    type: UUID,
    defaultValue: UUIDV4,
    primaryKey: true
  },
  userId: {
    type: UUID,
    allowNull: false
  },
  gameId: {
    type: UUID,
    allowNull: false
  }
});
Point.addHook('afterSave', async(point)=> {
  const { id, name } = await User.findByPk(point.userId);
  return client.sendCommand(['ZINCRBY', `leaderboard-${point.gameId}`, '1', JSON.stringify({ id, name})]);
});

Point.belongsTo(User);
Point.belongsTo(Game);

//User.belongsToMany(Game, { through: 'point'});
//Game.belongsToMany(User, { through: 'game'});




const init = async()=> {
  try {
    const port = process.env.PORT || 3000;
    await client.connect();
    await client.flushAll();
    await conn.sync({ force: true });
    const [moe, larry, lucy] = await Promise.all([
      User.create({ name: 'moe' }),
      User.create({ name: 'larry' }),
      User.create({ name: 'lucy' }),
    ]);

    const game = await Game.create();
    await Promise.all([
      Point.create({ userId: moe.id, gameId: game.id }),
      Point.create({ userId: moe.id, gameId: game.id }),
      Point.create({ userId: lucy.id, gameId: game.id }),
      Point.create({ userId: larry.id, gameId: game.id }),
    ]);
    console.log(await game.leaderboard());
    app.listen(port, ()=> console.log(`listening on port ${port}`));
  }
  catch(ex){
    console.log(ex);
  }
};

init();
