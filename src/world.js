import GridBody from "./gridBody";

export default class World {
  constructor(scene, config) {
    this.cnt = 0;

    this.scene = scene;

    // Size of Grid in pixels
    this.gridSize = new Phaser.Geom.Point(config.gridSize.x, config.gridSize.y);

    // Shadow size in pixels.
    this.shadowSize = 0;

    // Locked while pushed
    this.lockBodies = false;

    // Sprites and stuff with gridPhysics enable
    this.bodies = [];

    // Collidable tilemap layers
    this.tilemaplayers = [];

    this.tileGridRatio = new Phaser.Geom.Point(-1, -1);

    this._pushChain = [];

    this.stairs = [];

    this.map = null;

    this.debugGfx = {
      graphics: null,
      update: true,
      grid: {
        active: false,
        wasActive: false,
        data: null
      },
      path: {
        active: false,
        wasActive: false,
        data: null
      },
      pathCollision: {
        active: false,
        wasActive: false
      },
      collision: {
        active: false,
        wasActive: false,
        data: null
      }
    };

    window.debugGfx = this.debugGfx;

    this.turnbased = false;
    this.turn = 0;
    this.que = [];
    this.firstInLine = null;
    this.collisionMap = null;

    this.showWarnings = true;

    this.drawDebug = config.debug ? this.createDebugGraphic() : false;
  }

  enable(entity) {
    switch (entity.type) {
      case "Sprite":
        entity.body = new GridBody(entity);
        this.bodies.push(entity.body);
        break;
      case "DynamicTilemapLayer":
      case "StaticTilemapLayer":
        if (
          this.showWarnings &&
            (entity.collisionWidth % this.gridSize.x !== 0
              || entity.collisionHeight % this.gridSize.y !== 0)
        ) {
          console.warn(
            "Tile size isn't an even multiplier of the grid size. This will probably break your game."
          );
        }
        this.tilemaplayers.push(entity);
        entity.level = entity.level ? entity.level : 0;
        entity.setOrigin(0, 0);
        if (this.tileGridRatio.x === -1) {
          this.tileGridRatio.setTo(
            entity.collisionWidth / this.gridSize.x,
            entity.collisionHeight / this.gridSize.y
          );
        }
        this.updateBorders(entity);
        return;
      default:
        // Phaser.TILEMAP????
        if (entity.hasOwnProperty) {
          this.map = entity;
        }
        //            debugger;
        break;
    }
  }
  updateBorders(layer) {
    let data = layer.layer.data;
    for (let y = 0; y < data.length; y++) {
      for (let x = 0; x < data[y].length; x++) {
        let tile = data[y][x];
        if (tile.borderUp) {
          tile.collideUp = true;
          data[y - 1][x].collideDown = true;
          data[y - 1][x].gotBorder = true;
        }
        if (tile.borderDown) {
          tile.collideDown = true;
          data[y + 1][x].collideUp = true;
          data[y + 1][x].gotBorder = true;
        }
        if (tile.borderLeft) {
          tile.collideLeft = true;
          data[y][x - 1].collideRight = true;
          data[y][x - 1].gotBorder = true;
        }
        if (tile.borderRight) {
          tile.collideRight = true;
          data[y][x + 1].collideLeft = true;
          data[y][x + 1].gotBorder = true;
        }
      }
    }
  }

  addToQue(body, reload = 0) {
    if (!body.hasOwnProperty("myTurn")) {
      if (body.hasOwnProperty("body")) {
        body = body.body;
      } else if (typeof body === "object" && body.length > 0) {
        body.forEach(b => {
          this.addToQue(b, reload);
        });
        return;
      } else {
        console.error(
          "You need to pass a sprite with gridBody, gridBody or an array to addToQue."
        );
      }
    }

    this.firstInLine = this.firstInLine ? this.firstInLine : body.sprite;
    this.firstInLine.body.myTurn = true;

    if (reload === 0) {
      reload = body.reload > 0 ? body.reload : 1;
    }
    // Fill the que with nulls to make room for quicker or faster units.
    if (this.que.length < reload * 2) {
      for (let s = 0; s < reload * 2; s++) {
        this.que.push(null);
      }
    }
    let pos = reload * 2;
    while (this.que[pos] != null) {
      pos++;
    }
    this.que.splice(pos, 0, body);

    // Remove unnecessary nulls in the beginning of the array from the first added body
    while (this.que[0] === null && this.que.length > 0) {
      this.que.shift(0);
    }
  }

  nextTurn(reload = 0) {
    let body = null;

    // Add current body to the end of the que
    this.addToQue(this.firstInLine, reload);
    this.firstInLine.body.myTurn = false;
    this.firstInLine.body.turn++;

    // Keep track of total global moves
    this.turn++;
    this.que.shift(0);

    while (this.que[0] === null && this.que.length > 0) {
      this.que.shift(0);
    }

    if (this.que.length === 0) {
      console.error("EMPTY QUE!");
      return;
    }

    body = this.que[0];
    body.myTurn = true;
    this.firstInLine = body.sprite;
  }

  update(time, delta) {
    this.turnMade = false;
    let elapsedTime = delta / 1000; //body.game.time.physicsElapsed

    for (const body of this.bodies) {
      if (!body.sprite.active) {
        continue;
      }
      let next = {
        x: body.sprite.x,
        y: body.sprite.y
      };
      for (let dim of ["x", "y"]) {
        if (body.velocity[dim] === 0) {
          // Stannat, fixa positionen exakt.
          body.sprite[dim] = body.gridPosition[dim] * body.world.gridSize[dim] - body.offset[dim];
          continue;
        }
        if (body.gridPosition[dim] * body.world.gridSize[dim] != body.sprite[dim] + body.offset[dim]) {
          body.sprite[dim] += body.velocity[dim] * elapsedTime;
          next[dim] = body.sprite[dim] + body.velocity[dim] * elapsedTime;
        }
        if (body.velocity[dim] > 0
          && next[dim] > body.gridPosition[dim] * body.world.gridSize[dim] - body.offset[dim]) {
          // Nästa steg är klart!
          body.isLocked[dim] = false; // Kan sätta ny gridPosition och velocity!
        }
        if (body.velocity[dim] < 0
          && next[dim] < body.gridPosition[dim] * body.world.gridSize[dim] - body.offset[dim]) {
          // Nästa steg är klart!
          body.isLocked[dim] = false; // Kan sätta ny gridPosition och velocity!
        }
        if (!body.isLocked.x && !body.isLocked.y && this.turnbased) {
          body.setVelocity(0);
        }
      }
    }

    if (this.drawDebug) {
      var graphics = this.debugGraphic;

      graphics.clear();

      this.bodies.forEach(body => {
        //if (body && body.willDrawDebug())
        //{
        // if (!body.sprite.active) {
        //   console.log(body);
        //   debugger;
        //   return;
        // }
        body.drawDebug(graphics);
        //}
      });
    }
  }

  renderDebug() {
    let gfx = this.debugGfx;
    if (
      gfx.grid.active != gfx.grid.wasActive ||
      gfx.path.active != gfx.path.wasActive ||
      gfx.pathCollision.active != gfx.pathCollision.wasActive ||
      gfx.collision.active != gfx.collision.wasActive
    ) {
      if (gfx.graphics) {
        gfx.graphics.clear();
      } else {
        gfx.graphics = game.add.graphics(0, 0);
      }

      if (gfx.grid.active) {
        this.renderGrid();
      }

      if (gfx.path.active) {
        this.renderPath();
      }

      if (gfx.pathCollision.active) {
        this.renderPathCollision();
      }

      if (gfx.collision.active) {
        this.renderCollision();
      }

      for (let type of ["grid", "collision", "path", "pathCollision"]) {
        gfx[type].wasActive = gfx[type].active;
      }

      if (
        gfx.grid.active ||
        gfx.path.active ||
        gfx.pathCollision.active ||
        gfx.collision.active
      ) {
        gfx.graphics.alpha = 1;
      } else {
        gfx.graphics.alpha = 0;
      }
    }
  }

  renderGrid() {
    let graphics = this.debugGfx.graphics;
    graphics.lineStyle(1, 0x000000, 0.2);
    for (let x = 0; x < this.game.width / this.gridSize.x; x++) {
      graphics.moveTo(x * this.gridSize.x, 0);
      graphics.lineTo(x * this.gridSize.x, this.game.height);
    }
    for (let y = 0; y < this.game.height / this.gridSize.y; y++) {
      graphics.moveTo(0, y * this.gridSize.y);
      graphics.lineTo(this.game.width, y * this.gridSize.y);
    }
  }

  renderCollision() {
    let graphics = this.debugGfx.graphics;
    graphics.lineStyle(0, 0x00ff00, 0.0);

    for (let layer of this.tilemaplayers) {
      for (let y in layer.layer.data) {
        for (let x in layer.layer.data[y]) {
          let tile = layer.layer.data[y][x];
          if (tile.collides) {
            graphics.beginFill(0xff0000, 0.5);
            graphics.drawRect(
              x * tile.width + 1,
              y * tile.height + 1,
              tile.width - 2,
              tile.height - 2
            );
            graphics.endFill();
          }
        }
      }
    }
  }

  renderPathCollision(data) {
    if (data) {
      this.debugGfx.pathCollision.data = data;
      this.debugGfx.pathCollision.wasActive = false;
      return;
    }
    if (
      !this.debugGfx.pathCollision.data ||
      this.debugGfx.pathCollision.data.length === 0
    ) {
      return;
    }

    let graphics = this.debugGfx.graphics;
    let grid = this.debugGfx.pathCollision.data;

    for (let y = 0; y < grid.length; y++) {
      graphics.lineStyle(1, 0xff0000, 0.3);
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] != 0) {
          if (grid[y][x] < 2) {
            graphics.beginFill(0xff3300, 0.4);
          } else if (grid[y][x] == 4) {
            graphics.beginFill(0x0000ff, 0.4);
          } else {
            graphics.beginFill(0xff33ff, 0.4);
          }
          graphics.drawRect(
            x * this.gridSize.x,
            y * this.gridSize.y,
            this.gridSize.x,
            this.gridSize.y
          );
          graphics.endFill();
        }
      }
    }
  }

  renderPath(data) {
    if (data) {
      this.debugGfx.path.data = data;
      this.debugGfx.path.wasActive = false;
      return;
    }
    if (!this.debugGfx.path.data || this.debugGfx.path.data.length === 0) {
      return;
    }

    let graphics = this.debugGfx.graphics;
    let path = this.debugGfx.path.data;
    graphics.lineStyle(1, 0x00ff00, 0.5);
    for (let point of path) {
      graphics.beginFill(0x00ff00, 0.4);

      graphics.drawRect(
        point.x * this.gridSize.x,
        point.y * this.gridSize.y,
        this.gridSize.x,
        this.gridSize.y
      );
    }
    let lastPoint = path[path.length - 1];
    graphics.beginFill(0xff3300, 0.7);

    graphics.drawRect(
      lastPoint.x * this.gridSize.x,
      lastPoint.y * this.gridSize.y,
      this.gridSize.x,
      this.gridSize.y
    );
    graphics.endFill();
  }

  resetCollisionLayer() {
    let map = this.map;
    let colLayerIndex = map.getLayerIndex("gridPhysicsCollision");
    let colTile, tile;
    for (let x = 0; x < map.layers[colLayerIndex].width; x++) {
      for (let y = 0; y < map.layers[colLayerIndex].height; y++) {
        //console.log(collisionLayerName);
        map.putTileAt(1, x, y, "gridPhysicsCollision");
        colTile = map.getTileAt(x, y, "gridPhysicsCollision");
        colTile.collideUp = false;
        colTile.collideRight = false;
        colTile.collideDown = false;
        colTile.collideLeft = false;
        //colTile.collides = false;
      }
    }
  }

  addToLayerToCollision(layer) {
    //console.log("lay",layer);
    //let map = this.map;
    console.log("WHAT");
    let map = layer.tilemap;
    layer.collisionWidth = map.tileWidth;
    layer.collisionHeight = map.tileHeight;
    console.log(layer.collisionHeigh, map, layer);
    // console.log(layer, map, "what")
    let colLayerIndex = map.getLayerIndex("gridPhysicsCollision");
    console.log("COL", layer);

    //let collisionLayer = null;
    let colTile, tile;
    tile = map.getTileAt(1, 0, layer);
    console.log("tile", tile.index);
    if (!colLayerIndex) {
      let collisionLayer = map.createBlankDynamicLayer(
        "gridPhysicsCollision",
        map.width,
        map.height,
        map.tileWidth,
        map.tileHeight
      );
      colLayerIndex = map.getLayerIndex("gridPhysicsCollision");
      collisionLayer.visible = false;
      this.resetCollisionLayer();
    }
    console.log(map);
    tile = map.getTileAt(1, 0, layer);
    console.log("tile", tile.index);
    // Prepare the collision layer

    // Loop tiles for collision and add to collision layer
    console.log("layerindex", layer.layerIndex);
    console.log("asa", layer);

    for (let x = 0; x < layer.width; x++) {
      console.log(x);
      for (let y = 0; y < layer.height; y++) {
        //console.log(x+"  "+y)
        let tile = map.getTileAt(x, y, layer);

        if (tile === null) {
          continue;
        }

        if (tile.index !== 21) {
          console.log(tile);
        } else {
          console.log(".");
        }
        //console.log(tile);

        colTile = map.getTileAt(x, y, "gridPhysicsCollision");
        colTile.collideUp = tile.collideUp ? true : colTile.collideUp;
        colTile.collideRight = tile.collideRight ? true : colTile.collideRight;
        colTile.collideDown = tile.collideDown ? true : colTile.collideDown;
        colTile.collideLeft = tile.collideLeft ? true : colTile.collideLeft;
        //colTile.collides = tile.collides ? true : colTile.collides;*/

        // console.log("TILE", colTile);
      }
    }

    // Set all non-collision tiles to null (save some ram and probably perfomance)
    /*for (var x = 0; x < map.layers[colLayerIndex].width; x++) {
            for (var y = 0; y < map.layers[colLayerIndex].height; y++) {
                colTile = map.getTile(x, y, collisionLayerName);
                if (!colTile.collideUp && !colTile.collideDown && !colTile.collideLeft && !colTile.collideRight) {
                    map.putTile(null, x, y, collisionLayerName);
                }
            }
        }*/

    // Build collision grid for pathfinding!

    // Fix faces - Not used by GridPhysics ATM, but could be nice for visual debugging
    //  map.calculateFaces(colLayerIndex);

    //return collisionLayer ? collisionLayer : null;
    console.log(map.layers[colLayerIndex]);
  }

  setLayerLevel(layer, level) {
    layer.level = level;
  }

  addStairs(obj) {
    this.stairs.push({
      x: obj.x / this.gridSize.x,
      y: obj.y / this.gridSize.y - 2, // Don't remember why -2 is there. Remove?
      width: obj.width / this.gridSize.x,
      height: obj.height / this.gridSize.y
    });
  }

  /**
   * Creates the graphics object responsible for debug display.
   *
   * @method Phaser.Physics.Arcade.World#createDebugGraphic
   * @since 3.0.0
   *
   * @return {Phaser.GameObjects.Graphics} [description]
   */
  createDebugGraphic() {
    var graphic = this.scene.sys.add.graphics({ x: 0, y: 0 });

    graphic.setDepth(Number.MAX_VALUE);

    this.debugGraphic = graphic;

    return true;
  }
}
