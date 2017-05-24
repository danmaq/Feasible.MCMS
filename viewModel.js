/**
 * 持ち高情報一覧。
 */
var Positions =
	Backbone.Collection.extend(
	{
		model: Position,
		gain: function ()
		{
			return this.reduce(Positions.gainIterator, 0);
		},
		deposit: function ()
		{
			return Math.abs(this.reduce(Positions.depositIterator, 0));
		},
		takeProfit: function ()
		{
			var profited = this.filter(function (v) { return v.get("isTakeProfit"); });
			return this.closing(profited);
		},
		closeAtType: function (type)
		{
			var profited =
				this.filter(function (v) { return type.str === v.get("type").str; });
			_.each(profited, function (v)
			{
				Directions.add(
					DIRECTION_TYPE.CLOSE,
					LIMIT_TYPE.NONE,
					v.get("type"),
					v.get("price"),
					v.get("bets"),
					v.get("takeProfit"));
			});
			return this.closing(profited);
		},
		closing: function (positions)
		{
			this.remove(positions);
			return _.reduce(positions, Positions.gainIterator, 0);
		},
	},
	{
		instance: null,
		add: function (tt, cr, bt, tp)
		{
			Positions.instance.add(Position.params(tt, cr, bt, tp));
		},
		gainIterator: function (m, v) { return m + v.get("gain"); },
		depositIterator: function (m, v) { return m + v.get("deposit"); },
	});
Positions.instance = new Positions();

/**
 * 指値予約情報一覧。
 */
var LimitOrders =
	Backbone.Collection.extend(
	{
		model: LimitOrder,
		contract: function ()
		{
			var contracted = this.filter(function (v) { return v.get("contract"); });
			var positions = _.map(contracted, function (v) { return v.get("position"); });
			this.remove(contracted);
			Positions.instance.add(positions);
			return contracted.length;
		},
		cancel: function ()
		{
			this.each(function (v)
			{
				var p = v.get("position");
				Directions.add(
					DIRECTION_TYPE.CANCEL,
					v.get("type"),
					p.get("type"),
					p.get("price"),
					p.get("bets"),
					p.get("takeProfit"));
			});
			this.reset();
		}
	},
	{
		instance: null,
		add: function (lt, tt, cr, bt, tp)
		{
			LimitOrders.instance.add(
				LimitOrder.params(lt, Position.create(tt, cr, bt, tp)));
		}
	});
LimitOrders.instance = new LimitOrders();

/**
 * 指示情報一覧。
 */
var Directions =
	Backbone.Collection.extend({ model: Direction },
	{
		instance: null,
		add: function (dt, lt, tt, cr, bt, tp)
		{
			Directions.instance.add(
				Direction.params(dt, lt, Position.create(tt, cr, bt, tp)));
			if (dt.trade)
			{
				if (lt.none)
				{
					Positions.add(tt, cr, bt, tp);
				}
				else
				{
					LimitOrders.add(lt, tt, cr, bt, tp);
				}
			}
		},
	});
Directions.instance = new Directions();

/**
 * 設定ビューモデル。
 */
var PreferenceView =
	Backbone.Epoxy.View.extend({
		el: "#preference",
		bindings: "data-bind",
		model: Preference.instance,
		events: { "click #start": "onStart", "change .preference": "onStart" },
		onStart: function ()
		{
			this.model.toStorage();
			Fluctuation.instance.reset();
			reset();
		},
	},
	{ instance: null });

/**
 * 変動ビューモデル。
 */
var FluctuationView =
	Backbone.Epoxy.View.extend({
		el: "#fluctuation",
		bindings: "data-bind",
		model: Fluctuation.instance,
		events: { "click #up": "onUp", "click #down": "onDown", "click #decide": "onDecide" },
		changeRate: function (offset)
		{
			this.model.addMultiply(offset);
			PositionsView.instance.applyBindings();
			ResultView.instance.refresh();
		},
		onUp: function () { this.changeRate(1); },
		onDown: function () { this.changeRate(-1); },
		onDecide: function () { fluctuate(); },
	},
	{ instance: null });

/**
 * 結果ビューモデル。
 */
var ResultView =
	Backbone.Epoxy.View.extend({
		el: "#result",
		bindings: "data-bind",
		model: Result.instance,
		refresh: function ()
		{
			this.model.set("gains", Positions.instance.gain());
			this.model.set("deposit", Positions.instance.deposit());
		},
	},
	{ instance: null });

/**
 * 指示ビューモデル。
 */
var DirectionsView =
	Backbone.Epoxy.View.extend({
		el: "#directions",
		itemView: Backbone.View.extend({
			tagName: "li",
			initialize: function ()
			{
				this.$el.text(this.model.get("infomation"));
				this.$el.addClass(this.model.get("tradeType").str);
			},
		}),
		collection: Directions.instance,
	},
	{ instance: null });

/**
 * 持ち高ビューモデル。
 */
var PositionsView =
	Backbone.Epoxy.View.extend({
		el: "#positions",
		itemView: Backbone.View.extend({
			tagName: "li",
			initialize: function ()
			{
				this.$el.text(this.model.get("infomation"));
				this.$el.addClass(this.model.get("type").str);
			},
		}),
		collection: Positions.instance,
	},
	{ instance: null });

/**
 * 指値予約ビューモデル。
 */
var LimitOrdersView =
	Backbone.Epoxy.View.extend({
		el: "#limitOrders",
		itemView: Backbone.View.extend({
			tagName: "li",
			initialize: function ()
			{
				this.$el.text(this.model.get("infomation"));
				this.$el.addClass(this.model.get("position").get("type").str);
			},
		}),
		collection: LimitOrders.instance,
	},
	{ instance: null });

/**
 * 変動確定
 */
function fluctuate()
{
	Directions.instance.reset();
	var gap = Fluctuation.instance.getFluctuateGap();
	if (Math.abs(gap) > 0)
	{
		Fluctuation.instance.decide();
		var profits = Positions.instance.takeProfit();
		if (Fluctuation.instance.get("reverse"))
		{
			var bet = Fluctuation.instance.get("bet");
			profits +=
				Positions.instance.closeAtType(bet > 0 ? TRADE_TYPE.BUY : TRADE_TYPE.SELL);
		}
		LimitOrders.instance.contract();
		profits += Positions.instance.takeProfit();
		LimitOrders.instance.cancel();
		Result.instance.add("profits", profits);
		ResultView.instance.refresh();
		FluctuationView.instance.applyBindings();
		directionLimitTrade();
	}
}

/**
 * リセット
 */
function reset()
{
	if (!Preference.instance.get("valid"))
	{
		console.log("Invalid preference.");
		return;
	}
	var ask = Fluctuation.instance.get("ask");
	var ss = Preference.instance.getN("stepSize");
	var sp = Preference.instance.get("spreadP");
	Result.instance.reset();
	Directions.instance.reset();
	Positions.instance.reset();
	LimitOrders.instance.reset();
	Directions.add(DIRECTION_TYPE.TRADE, LIMIT_TYPE.NONE, TRADE_TYPE.BUY, ask, 1, ask + ss - sp);
	Directions.add(DIRECTION_TYPE.TRADE, LIMIT_TYPE.NONE, TRADE_TYPE.SELL, ask - sp, 1, ask - ss);
	directionLimitTrade();
	Fluctuation.instance.startReplay(fluctuate);
	PositionsView.instance.applyBindings();
	ResultView.instance.refresh();
}

/**
 * 指値注文の登録
 */
function directionLimitTrade(bet)
{
	var ask = Fluctuation.instance.get("ask");
	var bet = Fluctuation.instance.get("bet");
	var abet = Math.abs(bet);
	var warped = Fluctuation.instance.get("warp") > 3;
	var ss = Preference.instance.getN("stepSize");
	var sp = Preference.instance.get("spreadP");
	var trade = DIRECTION_TYPE.TRADE;
	var buy = TRADE_TYPE.BUY;
	var sell = TRADE_TYPE.SELL;
	Directions.add(
		trade, LIMIT_TYPE.STOP, buy, ask + ss, 1, ask + ss * 2 - sp);
	Directions.add(
		trade, LIMIT_TYPE.LIMIT, sell, ask + ss - sp, bet > 0 ? abet * (warped ? 2 : 1) : 1 , ask);
	Directions.add(
		trade, LIMIT_TYPE.LIMIT, buy, ask - ss, bet < 0 ? abet * (warped ? 2 : 1) : 1, ask - sp);
	Directions.add(
		trade, LIMIT_TYPE.STOP, sell, ask - ss - sp, 1, ask - ss * 2);
	if (warped)
	{
		if (bet < 0)
		{
			Directions.add(trade, LIMIT_TYPE.NONE, buy, ask, abet, ask + ss - sp);
		}
		else
		{
			Directions.add(trade, LIMIT_TYPE.NONE, sell, ask - sp, abet, ask - ss);
		}
	}
}

/**
 * 初回処理
 */
$(function ()
{
	PreferenceView.instance = new PreferenceView();
	FluctuationView.instance = new FluctuationView();
	ResultView.instance = new ResultView();
	DirectionsView.instance = new DirectionsView();
	PositionsView.instance = new PositionsView();
	LimitOrdersView.instance = new LimitOrdersView();
	reset();
});
