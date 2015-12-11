
var exec = require('child_process').exec;

var Alerts = (function(){

    function Alerts(config) {
        this.notificationAction = 'arn:aws:sns:eu-west-1:995309606778:core-testing';
        this.stageName = 'dev';
        this.projectName = 'parcelsvc';
        this.moduleName = 'parcel';
        this.functionName = 'import';
        this.alerts = {};
        this.hasAlertConfig = false;

        var config = config || {};
        if (typeof(config.notificationAction) != 'undefined') {
            this.notificationAction = config.notificationAction;
        }
        if (typeof(config.stageName) != 'undefined') {
            this.stageName = config.stageName;
        }
        if (typeof(config.projectName) != 'undefined') {
            this.projectName = config.projectName;
        }
        if (typeof(config.moduleName) != 'undefined') {
            this.moduleName = config.moduleName;
        }
        if (typeof(config.functionName) != 'undefined') {
            this.functionName = config.functionName;
        }
        if (typeof(config.alerts) != 'undefined') {
            this.alerts = config.alerts;
            this.hasAlertConfig = true;
        }

        console.log('adding alarms: ' + this.moduleName + ' ' + this.functionName);

        this.listFunctions( function (error, stdout, stderr) {
            this.addAlarmToFunction(error, stdout, stderr)
        }.bind(this));
    };

    Alerts.prototype.listFunctions = function(callback){
        exec("aws lambda list-functions", callback);
    };

    Alerts.prototype.addAlarmToFunction = function(error, stdout, stderr){
        var allFunctions = JSON.parse(stdout);

        for (var i in allFunctions.Functions) {
            var functionData = allFunctions.Functions[i];
            if (
                functionData.Handler.indexOf(this.moduleName) > -1
                && functionData.Handler.indexOf(this.functionName) > -1
                && functionData.FunctionName.indexOf(this.stageName) > -1
                && functionData.FunctionName.indexOf(this.projectName) > -1
            ) {
                if (this.hasAlertConfig) {
                    for (var metricname in this.alerts) {
                        exec(this.getConfigAlarm(functionData.FunctionName, metricname, this.alerts[metricname]), function () {
                            console.log('alarm added');
                        });
                    }
                } else {
                    // applying default alerts for cli calls of this
                    console.log(functionData.FunctionName + ': creating alarms');
                    exec(this.getDurationAlarm(functionData.FunctionName), function () {
                        console.log('duration alarm added');
                    });

                    exec(this.getErrorsAlarm(functionData.FunctionName), function () {
                        console.log('error alarm added');
                    });

                    exec(this.getThrottlesAlarm(functionData.FunctionName), function () {
                        console.log('throttles alarm added');
                    });
                }
            }
        }
    };

    Alerts.prototype.getConfigAlarm = function(functionName, metric, alertConfig){
        return this.getPutMetricAlarmCmd({
            'alarmName': functionName + ' ' + metric,
            'alarmDescription': alertConfig.description,
            'metricName': metric,
            'alarmNamespace': alertConfig.alarmNamespace,
            'alarmStatisticType': alertConfig.alarmStatisticType,
            'alarmPeriod': alertConfig.alarmPeriod,
            'alarmThreshold': alertConfig.alarmThreshold,
            'comparisonOperator': alertConfig.comparisonOperator,
            'functionName': functionName,
            'evaluationPeriod': alertConfig.evaluationPeriod,
            'notificationAction': this.notificationAction
        });
    };

    Alerts.prototype.getDurationAlarm = function(functionName){
        return this.getPutMetricAlarmCmd({
            'alarmName': functionName + ' Duration',
            'alarmDescription': 'Alarm if function run time is above 500ms',
            'metricName': 'Duration',
            'alarmNamespace': 'AWS/Lambda',
            'alarmStatisticType': 'Maximum',
            'alarmPeriod': '60',
            'alarmThreshold': '500',
            'comparisonOperator': 'GreaterThanOrEqualToThreshold',
            'functionName': functionName,
            'evaluationPeriod': '1',
            'notificationAction': this.notificationAction
        });
    };

    Alerts.prototype.getErrorsAlarm = function(functionName){
        return this.getPutMetricAlarmCmd({
            'alarmName': functionName + ' Errors',
            'alarmDescription': 'Alarm if function returns an error',
            'metricName': 'Errors',
            'alarmNamespace': 'AWS/Lambda',
            'alarmStatisticType': 'Sum',
            'alarmPeriod': '60',
            'alarmThreshold': '1',
            'comparisonOperator': 'GreaterThanOrEqualToThreshold',
            'functionName': functionName,
            'evaluationPeriod': '1',
            'notificationAction': this.notificationAction
        });
    };

    Alerts.prototype.getThrottlesAlarm = function(functionName){
        return this.getPutMetricAlarmCmd({
            'alarmName': functionName + ' Throttles',
            'alarmDescription': 'Alarm if function has more than 5 throttled requests',
            'metricName': 'Throttles',
            'alarmNamespace': 'AWS/Lambda',
            'alarmStatisticType': 'Sum',
            'alarmPeriod': '60',
            'alarmThreshold': '5',
            'comparisonOperator': 'GreaterThanOrEqualToThreshold',
            'functionName': functionName,
            'evaluationPeriod': '1',
            'notificationAction': this.notificationAction
        });
    };

    Alerts.prototype.getPutMetricAlarmCmd = function(config){
        var addCommand = 'aws cloudwatch put-metric-alarm ';
        addCommand += ' --alarm-name "' + config.alarmName + '" ';
        addCommand += ' --alarm-description "' + config.alarmDescription + '" ';
        addCommand += ' --metric-name ' + config.metricName + ' ';
        addCommand += ' --namespace "' + config.alarmNamespace + '" ';
        addCommand += ' --statistic ' + config.alarmStatisticType + ' ';
        addCommand += ' --period ' + config.alarmPeriod + ' ';
        addCommand += ' --threshold ' + config.alarmThreshold + ' ';
        addCommand += ' --comparison-operator ' + config.comparisonOperator + ' ';
        addCommand += ' --dimensions  Name=FunctionName,Value=' + config.functionName + ' ';
        addCommand += ' --evaluation-periods ' + config.evaluationPeriod + ' ';
        addCommand += ' --alarm-actions ' + config.notificationAction + ' ';
        addCommand += ' --ok-actions ' + config.notificationAction + ' ';
        addCommand += ' --insufficient-data-actions ' + config.notificationAction + ' ';

        return addCommand;
    };

    return Alerts;
})();

module.exports = Alerts;

if (process.argv.length != 0) {
    var args = {}
    var numberArguments = 0;
    for (var i in process.argv) {
        if (i > 1) {
            var parts = process.argv[i].split('=');
            var parameterName = parts[0].replace('--', '');
            var value = parts[1];

            args[parameterName] = value;
            numberArguments++;
        }
    }

    if (process.argv.length == 2 || numberArguments != 5) {
        console.log('This command adds alerts to the provided lambda function');
        console.log('Please add parameters:');
        console.log('--notificationAction=arn...');
        console.log('--stageName=staging');
        console.log('--projectName=parcelsvc');
        console.log('--moduleName=parcel');
        console.log('--functionName=import');
    } else {
        var alm = new Alerts(args);
    }
}