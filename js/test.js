"use strict";

function Test_Checker(host, checks_out_id, test_out_id) {
  var log;
  var checker = new Checker(host, checks_out_id);

  function run_check(name, check) {
    var el = jQuery(checks_out_id);
    if ("index" in check) {
      el = el.find("span.index:contains('Index: " + check.index + "')")
        .parent();
      if (el.length == 0) {
        return "Couldn't find index `" + check.index + "`";
      }
    }
    el = el.find("span.check:contains('" + name + "')").parent();
    if (el.length == 0) {
      return 'Couldn\'t find check "' + name + '"';
    }

    if ("msg" in check) {
      if (el.hasClass('green')) {
        return 'Check should not be green';
      }
      el = el.find("span.msg");
      if (el.length == 0) {
        return "Couldn't find error msg";
      }
      if (!el.text().match(check.msg)) {
        return "Error msg doesn't match " + check.msg;
      }
      return;
    }

    if (!el.hasClass('green')) {
      return 'Check should be green';
    }

  }

  function run_checks(test) {

    return Promise.attempt(function() {
      var i = 1;
      var test_color = 'green';
      forall(test.checks, function(check) {
        var err = run_check(test.name, check);
        var name = '[' + i + '] ';

        if (err) {
          test_color = 'red';
          log.result('red', name + err)
        } else {
          log.result('green', name + 'OK')
        }
        i++;
      });
      checker.log.clear();
      log.set_section_color(test_color);
    });
  }

  function setup_test(test) {
    var setup = test.setup.slice();

    function next_step() {
      var step = setup.shift();
      if (step === undefined) {
        return;
      }
      return send_request(step[0], step[1], step[2])//
      .then(next_step);
    }
    return Promise.attempt(next_step)

  }

  function run() {
    var tests;

    function next_test() {
      var test = tests.shift();
      if (test === undefined) {
        return;
      }
      log.start_section('test', test.name);

      return send_request('DELETE', '/_all')//
      .caught(function(e) {
        if (!e.match(/IndexMissingException/)) {
          throw (e)
        }
      }).then(function() {
        return setup_test(test)
      }).caught(function(e) {
        throw ("Error setting up test: " + e);
      }).then(function() {
        return checker.run() //
        .caught(function(e) {
          throw ("Error running checker: " + e)
        }).then(function() {
          return run_checks(test);
        })
      }).caught(function(e) {
        log.result('blue', e);
      }).then(function() {
        log.end_section();
        return next_test()
      });
    }

    tests = Checks.checks_for_phase('tests').slice();
    log = new Logger(test_out_id);
    log.log('Testing cluster at: ' + host);

    return Promise.attempt(next_test) //
    .then(function() {
      return Promise.attempt(finish)
    }) //
    .caught(log.error);
  }

  function finish() {
    log.log('Done');
  }

  function send_request(method, path, body) {
    var settings = {
      method : method,
      dataType : "json"
    };
    if (body) {
      settings.data = JSON.stringify(body);
    }

    return new Promise(function(resolve, reject) {
      jQuery.ajax(host + path, settings).done(resolve).fail(function(e) {
        var msg = "Request failed [" + method + " " + host + path + "]";
        if (body) {
          msg += " with body: " + JSON.stringify(body);
        }
        msg += " REASON: ";
        if (e.responseJSON && ("error" in e.responseJSON)) {
          msg += e.responseJSON.error;
        } else if (e.responseText) {
          msg += e.responseText;
        } else {
          msg += e.statusText;
        }
        reject(msg);
      });
    });
  }

  return {
    run : run
  };

}