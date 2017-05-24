$.extend({
	sprintf: function (format)
	{
		// 第2引数以降を順に処理
		for (var i = 1; i < arguments.length; i++)
		{
			// 正規表現でプレイスホルダと対応する引数の値を置換処理
			var reg = new RegExp('\\{' + (i - 1) + '\\}', 'g');
			format = format.replace(reg, arguments[i]);
		}
		return format;
	},
	toFixed: function (value)
	{
		return $.isNumeric(value) ? parseFloat(value).toFixed(2) : value;
	},
	toStorage: function (key, value)
	{
		localStorage.setItem(key, JSON.stringify(value));
	},
	fromStorage: function (key, alternative)
	{
		var json = localStorage.getItem(key);
		var body = null;
		try
		{
			body = JSON.parse(json);
		}
		catch(e)
		{
			console.log($.sprintf("Failed to load storage: {0}", key));
		}
		if (!body)
		{
			$.toStorage(key, body = alternative);
		}
		return body;
	},
});

/**
 * 設定クラス。
 */
var Preference =
	Backbone.Epoxy.Model.extend(
	{
		initialize: function ()
		{
			var def = $.fromStorage(
				Preference.uniqueKey, 
				{
					initialRate: 165,
					spread: 3.7,
					stepSize: 0.25,
					unit: 1000,
					lotUnit: 0.1,
				});
			this.set(def);
		},
		computeds: {
			lot: function () { return this.getN("unit") * this.getN("lotUnit"); },
			valid: function ()
			{
				return true &&
					Preference.isNum(
						this.get("initialRate"),
						Preference.minInitialRate,
						Preference.maxInitialRate) &&
					Preference.isNum(
						this.get("spread"),
						Preference.minSpread,
						Preference.maxSpread) &&
					Preference.isNum(
						this.get("stepSize"),
						Preference.minStepSize,
						Preference.maxStepSize) &&
					Preference.isNum(
						this.get("unit"),
						Preference.minUnit,
						Preference.maxUnit) &&
					Preference.isNum(
						this.get("lotUnit"),
						Preference.minLotUnit,
						Preference.maxLotUnit);
			},
			spreadP: function () { return this.getN("spread") * 0.01; },
		},
		getN: function (name) { return parseFloat(this.get(name)); },
		toStorage: function ()
		{
			localStorage.setItem(Preference.uniqueKey, JSON.stringify(this.toJSON()));
		}
	},
	{
		uniqueKey: "mcms_preference",
		minInitialRate: 0.05,
		maxInitialRate: 32767,
		minSpread: 0,
		maxSpread: 100,
		minStepSize: 0.05,
		maxStepSize: 100,
		minUnit: 100,
		maxUnit: 100000,
		minLotUnit: 0.01,
		maxLotUnit: 1000,
		instance: null,
		isNum: function (value, min, max)
		{
			var n = parseFloat(value);
			return $.isNumeric(value) && n >= min && n <= max;
		},
	});
Preference.instance = new Preference();

/**
 * 変動情報。
 */
var Fluctuation =
	Backbone.Epoxy.Model.extend(
	{
		initialize: function () { this.reset($.fromStorage(Fluctuation.uniqueKey, [])); },
		computeds: {
			ask: function ()
			{
				return this.get("currentRate");
			},
			bid: function ()
			{
				return this.get("ask") - Preference.instance.get("spreadP");
			},
			currentRate: function ()
			{
				var ir = Preference.instance.getN("initialRate");
				var ss = Preference.instance.getN("stepSize");
				return ir + ss * this.get("multiply");
			},
			askFixed: function () { return this.get("bid").toFixed(3); },
			bidFixed: function () { return this.get("bid").toFixed(3); },
			currentRateFixed: function () { return this.get("currentRate").toFixed(3); },
			valid: function () { return Preference.instance.get("valid"); },
			historyJSON: function () { return JSON.stringify(this.get("history")); },
		},
		getMultiplyGap: function () { return this.get("multiply") - this.get("lastDecide"); },
		getFluctuateGap: function ()
		{
			return this.getMultiplyGap() * Preference.instance.getN("stepSize");
		},
		decide: function ()
		{
			this.addHistory();
			var mulgap = Math.abs(this.getMultiplyGap()) * 2 + 1;
			this.set("warp", mulgap);
			var bet = this.get("bet");
			this.set("lastBet", bet);
			var gplus = this.getFluctuateGap() > 0;
			if (bet >= 0)
			{
				this.set("reverse", bet > 1 && !gplus);
				bet = gplus ? bet * mulgap : -mulgap;
			}
			else
			{
				this.set("reverse", gplus);
				bet = gplus ? mulgap : (bet * mulgap);
			}
			this.set("bet", bet);
			this.set("lastDecide", this.get("multiply"));
		},
		setHistory: function (list)
		{
			var l = list ? list : [];
			this.set("history", l);
			$.toStorage(Fluctuation.uniqueKey, l);
		},
		addHistory: function ()
		{
			if (!this.get("replay"))
			{
				var list = this.get("history");
				list.push(this.get("multiply"));
				this.setHistory(list);
			}
		},
		addMultiply: function (offset)
		{
			this.set("multiply", this.get("multiply") + offset);
		},
		startReplay: function (callback)
		{
			var cb = callback ? callback : function () {};
			var self = this;
			this.set("replay", true);
			_.each(
				this.get("history"),
				function (v)
				{
					self.set("multiply", v);
					cb();
				});
			this.set("replay", false);
		},
		reset: function (list)
		{
			var initialRate = Preference.instance.getN("initialRate");
			this.setHistory(list);
			this.set("history", list ? list : []);
			this.set("replay", false);
			this.set("multiply", 0);
			this.set("lastDecide", 0);
			this.set("warp", 1);
			this.set("bet", 1);
			this.set("lastBet", 0);
			this.set("reverse", false);
		},
	},
	{
		uniqueKey: "mcms_fluctuation",
		instance: null,
	});
Fluctuation.instance = new Fluctuation();

/**
 * 結果情報。
 */
var Result = 
	Backbone.Epoxy.Model.extend(
	{
		initialize: function () { this.reset(); },
		computeds: {
			margin25: function () { return Math.ceil(this.get("deposit") / 25); },
			margin888: function () { return Math.ceil(this.get("deposit") / 888); },
			depositInt: function () { return Math.ceil(this.get("deposit")); },
		},
		add: function (name, offset) { this.set(name, this.get(name) + offset); },
		reset: function ()
		{
			this.set("profits", 0);
			this.set("gains", 0);
			this.set("deposit", 0);
		},
	},
	{ instance: null, });
Result.instance = new Result();

/**
 * 指示種別。
 */
var DIRECTION_TYPE =
	{
		TRADE: Backbone.Epoxy.Model.extend({}, {str: "Trade", trade: true}),
		CLOSE: Backbone.Epoxy.Model.extend({}, {str: "Close", trade: false}),
		CANCEL: Backbone.Epoxy.Model.extend({}, {str: "Cancel", trade: false}),
	};
/**
 * 取引種別。
 */
var TRADE_TYPE =
	{
		BUY: Backbone.Epoxy.Model.extend({},
		{
			str: "Buy",
			order: "ask",
			close: "bid",
			sign: 1,
			isProfit: function (tp) { return Fluctuation.instance.get("bid") >= tp; },
		}),
		SELL: Backbone.Epoxy.Model.extend({},
		{
			str: "Sell",
			order: "bid",
			close: "ask",
			sign: -1,
			isProfit: function (tp) { return Fluctuation.instance.get("ask") <= tp; },
		}),
	};
/**
 * 指値種別。
 */
var LIMIT_TYPE =
	{
		NONE: Backbone.Epoxy.Model.extend({}, {str: "", none: true}),
		STOP: Backbone.Epoxy.Model.extend({}, {str: " Stop", none: false}),
		LIMIT: Backbone.Epoxy.Model.extend({}, {str: " Limit", none: false}),
	};

/**
 * 持ち高情報。
 */
var Position =
	Backbone.Epoxy.Model.extend(
	{
		initialize: function (args)
		{
			this.set("type", args.type);
			this.set("price", args.price);
			this.set("bets", args.bets);
			this.set("takeProfit", args.takeProfit);
		},
		computeds: {
			currentRate: function ()
			{
				return Fluctuation.instance.get(this.get("type").close);
			},
			lot: function ()
			{
				return this.get("bets") * Preference.instance.get("lotUnit");
			},
			deposit: function ()
			{
				var unit = this.get("bets") * Preference.instance.get("lot");
				return unit * this.get("currentRate") * this.get("type").sign;
			},
			gain: function ()
			{
				var gr = this.getGain(this.get("currentRate"));
				var gt = this.getGain(this.get("takeProfit"));
				return Math.min(gr, gt);
			},
			isTakeProfit: function ()
			{
				return this.get("type").isProfit(this.get("takeProfit"));
			},
			displayPrice: function () { return this.get("price").toFixed(3); },
			displayType: function () { return this.get("type").str; },
			displayLot: function () { return this.get("lot").toFixed(2); },
			displayTP: function () { return this.get("takeProfit").toFixed(3); },
			infomation: function ()
			{
				return $.sprintf(
					"[{0}] {1} -> {2} ({3}), x{4}, T/P: {5}",
					this.get("displayType"),
					this.get("displayPrice"),
					this.get("currentRate").toFixed(3),
					this.get("gain"),
					this.get("displayLot"),
					this.get("displayTP"));
			},
		},
		getGain: function (rate)
		{
			var mul = Preference.instance.get("lot") * this.get("bets");
			return Math.floor((rate - this.get("price")) * mul * this.get("type").sign);
		},
	},
	{
		params: function (ty, pr, bt, tp)
		{
			return { type: ty, price: pr, bets: bt, takeProfit: tp };
		},
		create: function (ty, pr, bt, tp)
		{
			return new Position(Position.params(ty, pr, bt, tp));
		},
	});

/**
 * 指値予約情報。
 */
var LimitOrder =
	Backbone.Epoxy.Model.extend(
	{
		initialize: function (args)
		{
			this.set("type", args.type);
			this.set("position", args.position);
		},
		computeds: {
			currentRate: function ()
			{
				return Fluctuation.instance.get(this.get("position").get("type").order);
			},
			displayType: function () { return this.get("type").str; },
			contract: function ()
			{
				var buy = this.get("position").get("displayType") === TRADE_TYPE.BUY.str;
				var stop = this.get("displayType") === LIMIT_TYPE.STOP.str;
				var cr = this.get("currentRate");
				var price = this.get("position").get("price");
				return ((buy && stop) || !(buy || stop)) ? cr >= price : cr <= price;
			},
			infomation: function ()
			{
				var pos = this.get("position");
				return $.sprintf(
					"[{0} {1}] {2}, x{3}, T/P: {4}",
					pos.get("displayType"),
					this.get("displayType"),
					pos.get("displayPrice"),
					pos.get("displayLot"),
					pos.get("displayTP"));
			},
		},
	},
	{
		params: function (lt, ps)
		{
			return { type: lt, position: ps };
		},
		create: function (lt, ps)
		{
			return new LimitOrder(LimitOrder.params(lt, ps));
		},
	});

/**
 * 指示情報。
 */
var Direction =
	Backbone.Epoxy.Model.extend(
	{
		initialize: function (args)
		{
			this.set("directionType", args.directionType);
			this.set("limitType", args.limitType);
			this.set("position", args.position);
		},
		computeds: {
			tradeType: function () { return this.get("position").get("type"); },
			infomation: function ()
			{
				var position = this.get("position");
				return $.sprintf(
					"{0}: [{1}{2}] {3}, x{4}, T/P: {5}",
					this.get("directionType").str,
					position.get("displayType"),
					this.get("limitType").str,
					position.get("displayPrice"),
					position.get("displayLot"),
					position.get("displayTP"));
			},
		},
	},
	{
		params: function (dt, lt, ps)
		{
			return { directionType: dt, limitType: lt, position:ps };
		},
	});
