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
	}
});

var COMMAND =
	{
		TRADE: "Trade",
		CLOSE: "Close"
	};
var TRADE_TYPE =
	{
		BUY: "Buy",
		SELL: "Sell"
	};
var TRADE_OPTION =
	{
		NO_LIMIT: "N/L",
		STOP: "Stop",
		LIMIT: "Limit",
	};
var Order = 
	function (order, type, price, lot, takeProfit, option)
	{
		this.order = order;
		this.type = type;
		this.price = price;
		this.lot = lot;
		this.takeProfit = takeProfit ? takeProfit : "*****";
		this.option = option ? option : "";
		this.fixedPrice = function () { return $.toFixed(this.price); };
		this.fixedTP = function () { return $.toFixed(this.takeProfit); };
		this.toPosition = function () { return new Position(this.type, this.price, this.lot, this.takeProfit); };
		this.toPreOrder = function () { return new PreOrder(this.type, this.option, this.price, this.lot, this.takeProfit); };
	};
var Position = 
	function (type, price, lot, takeProfit)
	{
		this.type = type;
		this.price = price;
		this.lot = lot;
		this.fluctuated = price;
		this.sign = type == TRADE_TYPE.BUY ? 1 : -1;
		this.takeProfit = takeProfit ? takeProfit : "*****";
		this.fixedPrice = function () { return $.toFixed(this.price); };
		this.fixedTP = function () { return $.toFixed(this.takeProfit); };
		this.fixedFL = function () { return $.toFixed(this.fluctuated); };
		this.isContract = function ()
		{
			return this.type == TRADE_TYPE.BUY ?
				this.fluctuated >= this.takeProfit : this.fluctuated <= this.takeProfit;
		};
		this.gain = function ()
		{
			return Math.floor((this.fluctuated - this.price) * this.lot * unit * this.sign);
		};
		this.gainTP = function ()
		{
			return Math.floor((this.takeProfit - this.price) * this.lot * unit * this.sign);
		};
	};
var PreOrder = 
	function (type, option, price, lot, takeProfit)
	{
		this.type = type;
		this.price = price;
		this.lot = lot;
		this.option = option;
		this.takeProfit = takeProfit ? takeProfit : "*****";
		this.fixedPrice = function () { return $.toFixed(this.price); };
		this.fixedTP = function () { return $.toFixed(this.takeProfit); };
		this.isTrade = function (fluctuated)
		{
			return (this.type == TRADE_TYPE.BUY && this.option == TRADE_OPTION.STOP) || (this.type == TRADE_TYPE.SELL && this.option == TRADE_OPTION.LIMIT) ?
				fluctuated >= this.price : fluctuated <= this.price;
		};
		this.toPosition = function () { return new Position(this.type, this.price, this.lot, this.takeProfit); };
	};

var initialRate = 165;
var exchangeGap = 0.25;
var unit = 1000;
var lotUnit = 0.01;
var lot = 0;
var currentRate = 165;
var totalProfits = 0;
var unrealizedGains = 0;
var martingale = 0;
var orders = [];
var positions = [];
var preorder = [];

/**
 * 数値検証
 */
function isValue(value, min, max)
{
	var mn = $.isNumeric(min) ? min : Number.NEGATIVE_INFINITY;
	var mx = $.isNumeric(max) ? max : Number.POSITIVE_INFITINY;
	return $.isNumeric(value) && value >= mn && value <= mx;
}

function connectField(id, init, set)
{
	var q = $(id);
	var change =
		function ()
		{
			var v = q.val();
			if (isValue(v, q.attr("min"), q.attr("max")))
			{
				set(parseFloat(v));
			}
		};
	q.val(init)
	q.change(change);
	change();
	return q;
}

function render(list, target, renderer)
{
	var html = $(target);
	html.empty();
	$.each(list, function (i, o) { html.append(renderer(o)); });
}

function refreshStatus()
{
	var rdr =
		function (o)
		{
			var format = "<li class=\"{1}\">{0}: {1} {2} {3}, x{4}, T/P: {5}</li>";
			return $.sprintf(format, o.order, o.type, o.option, o.fixedPrice(), o.lot, o.fixedTP());
		};
	render(orders, "#directions", rdr);
	var rpt =
		function (o)
		{
			var format = "<li class=\"{0}\">{0}: {1} -> {2} ({3}), x{4}, T/P: {5}</li>";
			return $.sprintf(format, o.type, o.fixedPrice(), o.fixedFL(), o.gain(), o.lot, o.fixedTP());
		};
	render(positions, "#positions", rpt);
	var rpo =
		function (o)
		{
			var format = "<li class=\"{0}\">{0} {1} {2}, x{3}, T/P: {4}</li>";
			return $.sprintf(format, o.type, o.option, o.fixedPrice(), o.lot, o.fixedTP());
		};
	render(preorders, "#preorders", rpo);
	$("#profit").text(totalProfits);
	$("#ugain").text(unrealizedGains);
}

function setCurrentRate(value)
{
	$("#ft").val((currentRate = value).toFixed(2));
}

function moveCurrentRate(value)
{
	setCurrentRate(currentRate + value);
}

function setLot()
{
	$("#lt").val(lot = unit * lotUnit);
}

function setDirection(command, type, price, lot, takeProfit, option)
{
	var order = new Order(command, type, price, lot, takeProfit, option);
	orders.push(order);
	switch (command)
	{
	case COMMAND.TRADE:
		if (option == TRADE_OPTION.NO_LIMIT)
		{
			positions.push(order.toPosition());
		}
		else
		{
			preorders.push(order.toPreOrder());
		}
		break;
	case COMMAND.CLOSE:
		break;
	}
}

function setPreOrder()
{
	setDirection(COMMAND.TRADE, TRADE_TYPE.BUY, currentRate + exchangeGap, lotUnit, currentRate + exchangeGap * 2, TRADE_OPTION.STOP);
	setDirection(COMMAND.TRADE, TRADE_TYPE.SELL, currentRate + exchangeGap, lotUnit, currentRate, TRADE_OPTION.LIMIT);
	setDirection(COMMAND.TRADE, TRADE_TYPE.BUY, currentRate - exchangeGap, lotUnit, currentRate, TRADE_OPTION.LIMIT);
	setDirection(COMMAND.TRADE, TRADE_TYPE.SELL, currentRate - exchangeGap, lotUnit, currentRate - exchangeGap * 2, TRADE_OPTION.STOP);
}

function reset()
{
	setCurrentRate(initialRate);
	setLot();
	orders = [];
	positions = [];
	preorders = [];
	totalProfits = 0;
	unrealizedGains = 0;
	martingale = 0;
	setDirection(COMMAND.TRADE, TRADE_TYPE.BUY, currentRate, lotUnit, currentRate + exchangeGap, TRADE_OPTION.NO_LIMIT);
	setDirection(COMMAND.TRADE, TRADE_TYPE.SELL, currentRate, lotUnit, currentRate - exchangeGap, TRADE_OPTION.NO_LIMIT);
	setPreOrder();
	refreshStatus();
}

function commit()
{
	if (currentRate == initialRate)
	{
		return;
	}
	orders = [];
	$.each(positions, function (i, o) {
		o.fluctuated = currentRate;
	});
	var contracted = $.grep(positions, function (o) { return o.isContract(); });
	positions = $.grep(positions, function (o) { return !o.isContract(); });
	$.each(contracted, function (i, o) {
		setDirection(COMMAND.CLOSE, o.type, o.price, o.lot, o.takeProfit);
		totalProfits += o.gainTP();
	});
	unrealizedGains = 0;
	$.each(positions, function (i, o) { unrealizedGains += o.gain(); });
	
	var traded = $.grep(preorders, function (o) { return o.isTrade(currentRate); });
	preorders = $.grep(preorders, function (o) { return !o.isTrade(currentRate); });
	$.each(traded, function (i, o) { positions.push(o.toPosition()); });
	
	setPreOrder();
	refreshStatus();
}

function init()
{
	connectField("#ir", initialRate, function (v) { initialRate = v; reset(); });
	connectField("#eg", exchangeGap, function (v) { exchangeGap = v; reset(); });
	connectField("#un", unit, function (v) { unit = v; reset(); });
	connectField("#lu", lotUnit, function (v) { lotUnit = v; reset(); });
	$("#up").click(function () { moveCurrentRate(exchangeGap) });
	$("#dn").click(function () { moveCurrentRate(-exchangeGap) });
	$("#reset").click(reset);
	$("#commit").click(commit);
	reset();
}

$(init);
