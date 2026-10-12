---
title: "Decommissioning readiness index: status of 47 packages for potential archival"
description: "Readiness index classifying 47 workspace packages as decommission-READY (0 live refs) or still-blocked, with reference counts and the locations of each remaining reference."
date: 2026-06-15
status: salvaged-from-tmp
source: "/tmp/claude-1001/-home-emsenn-561-group/e5fced88-124c-4481-a94f-3939e05f74d5/tasks/b595g1du4.output"
---


```
  blocked @emsenn/financial-topology                2 refs: lib/market-topology 
  blocked @emsenn/market-topology                   3 refs: apps/market-computer 
  lib/financial-codecs                       (no package.json — gone?)
  blocked @emsenn/ledger-algebra                    22 refs: apps/llm-computer/.tmp/test-dist/cost-ledger.mjs lib/ledger-codecs lib/ledger-topology 
  blocked @emsenn/ledger-codecs                     4 refs: apps/llm-computer/.tmp/test-dist/cost-ledger.mjs lib/ledger-topology 
  READY   @emsenn/ledger-topology                   0 refs
  blocked @emsenn/javascript-algebra                2 refs: lib/javascript-topology 
  READY   @emsenn/javascript-holography             0 refs
  READY   @emsenn/javascript-topology               0 refs
  blocked @561-group/astrology-topology             20 refs: lib/astrology-topology-experimental lib/astrology-topology-experimental/.tmp/test-dist/closure-events.d.mts lib/astrology-topology-experimental/.tmp/test-dist/closure-events.mjs lib/astrology-topology-experimental/.tmp/test-dist/conformance.test.mjs lib/astrology-topology-experimental/.tmp/test-dist/settlement.d.mts lib/astrology-topology-experimental/.tmp/test-dist/settlement.mjs lib/astrology-topology-experimental/.tmp/test-dist/settlement.test.mjs lib/astrology-topology-experimental/.tmp/test-dist/theories.d.mts lib/astrology-topology-experimental/.tmp/test-dist/theories.mjs lib/divination-codecs lib/divination-codecs/.tmp/test-dist/index.test.mjs lib/divination-topology lib/divination-topology/.tmp/test-dist/indicators.d.mts 
  READY   @561-group/astrology-topology-experimental  0 refs
  READY   @561-group/divination-codecs              0 refs
  blocked @561-group/divination-topology            3 refs: lib/divination-codecs lib/divination-codecs/.tmp/test-dist/index.test.mjs 
  blocked @561-group/calendar-topology              11 refs: lib/liturgy-topology lib/liturgy-topology/.tmp/test-dist/index.test.mjs lib/liturgy-topology/.tmp/test-dist/lection.mjs lib/liturgy-topology/.tmp/test-dist/rcl.d.mts lib/liturgy-topology/.tmp/test-dist/rcl.mjs lib/liturgy-topology/.tmp/test-dist/roman.d.mts lib/liturgy-topology/.tmp/test-dist/roman.mjs 
  READY   @561-group/liturgy-topology               0 refs
  blocked @emsenn/language-algebra                  27 refs: lib/english-language-algebra lib/english-language-codecs lib/lakota-language-algebra lib/language-analysis lib/language-codecs lib/language-conformance-topology lib/language-logic lib/language-topology lib/latin-language-algebra lib/tokipona-language-algebra 
  blocked @emsenn/language-analysis                 4 refs: lib/english-language-codecs lib/latin-language-algebra 
  blocked @emsenn/language-codecs                   10 refs: lib/english-language-algebra lib/english-language-codecs lib/lakota-language-algebra lib/latin-language-algebra lib/tokipona-language-algebra 
  READY   @emsenn/language-geometry                 0 refs
  READY   @emsenn/language-logic                    0 refs
  blocked @emsenn/language-topology                 42 refs: lib/english-language-algebra lib/english-language-codecs lib/lakota-language-algebra lib/language-analysis lib/language-codecs lib/language-conformance-topology lib/language-logic lib/latin-language-algebra lib/tokipona-language-algebra 
  blocked @emsenn/language-conformance-topology     3 refs: lib/agent lib/english-language-codecs 
  blocked @emsenn/english-language-algebra          5 refs: lib/english-language-codecs lib/language-conformance-topology 
  blocked @emsenn/english-language-codecs           2 refs: lib/agent 
  READY   @emsenn/latin-language-algebra            0 refs
  READY   @emsenn/lakota-language-algebra           0 refs
  READY   @emsenn/tokipona-language-algebra         0 refs
  blocked @emsenn/agent-algebra                     26 refs: apps/agent-computer/.tmp/test-dist/cli.mjs apps/llm-computer/.tmp/test-dist/index.mjs lib/agent-fleet-algebra lib/agent-fleet-algebra/.tmp/test-dist/dispatch.mjs lib/agent-fleet-algebra/.tmp/test-dist/dispatch.test.mjs lib/agent-fleet-algebra/.tmp/test-dist/governance.test.mjs lib/agent-fleet-algebra/.tmp/test-dist/index.mjs lib/agent-fleet-algebra/.tmp/test-dist/office-dispatch.test.mjs lib/agent-fleet-algebra/.tmp/test-dist/office.mjs lib/agent-topology lib/agent-topology/.tmp/test-dist/agent-topology.mjs lib/agent-topology/.tmp/test-dist/agent-topology.test.mjs lib/agent-topology/.tmp/test-dist/dream.mjs lib/agent-topology/.tmp/test-dist/dream.test.mjs 
  READY   @emsenn/agent-analysis                    0 refs
  blocked @emsenn/agent-topology                    10 refs: lib/agent-harness-topology lib/claude-code-topology lib/claude-topology lib/jsnode lib/jsnode-codecs 
  blocked @emsenn/agent-fleet-algebra               4 refs: apps/agent-computer/.tmp/test-dist/cli.mjs lib/agent-fleet-topology lib/jsnode lib/jsnode-topology 
  blocked @emsenn/agent-fleet-topology              1 refs: apps/agent-computer/.tmp/test-dist/cli.mjs 
  READY   @emsenn/agent-session-algebra             0 refs
  READY   @emsenn/agent-swarm-algebra               0 refs
  blocked @emsenn/agent-harness-topology            3 refs: lib/claude-code-cli-harness-topology 
  blocked @emsenn/llm-algebra                       23 refs: apps/llm-computer/.tmp/test-dist/cli.mjs apps/llm-computer/.tmp/test-dist/index.test.mjs apps/llm-computer/.tmp/test-dist/loop.mjs lib/llm-codecs-anthropic lib/llm-codecs-anthropic/.tmp/test-dist/index.test.mjs lib/llm-codecs-openai lib/llm-codecs-openai/.tmp/test-dist/index.test.mjs lib/llm-holography lib/llm-holography/.tmp/test-dist/index.mjs lib/llm-holography/.tmp/test-dist/index.test.mjs lib/llm-topology lib/llm-topology/.tmp/test-dist/index.mjs services/llm-server/.tmp/test-dist/cli.mjs services/llm-server/.tmp/test-dist/index.test.mjs services/llm-server/.tmp/test-dist/service.mjs 
  blocked @emsenn/llm-topology                      4 refs: apps/llm-computer/.tmp/test-dist/index.test.mjs apps/llm-computer/.tmp/test-dist/loop.mjs services/llm-server/.tmp/test-dist/index.test.mjs services/llm-server/.tmp/test-dist/service.mjs 
  blocked @emsenn/llm-holography                    2 refs: services/llm-server/.tmp/test-dist/index.mjs services/llm-server/.tmp/test-dist/service.mjs 
  blocked @emsenn/llm-codecs-anthropic              3 refs: lib/llm-holography lib/llm-holography/.tmp/test-dist/index.mjs 
  blocked @emsenn/llm-codecs-openai                 3 refs: lib/llm-holography lib/llm-holography/.tmp/test-dist/index.mjs 
  blocked @emsenn/claude-topology                   3 refs: lib/claude-code-topology 
  blocked @emsenn/claude-code-topology              3 refs: lib/claude-code-cli-harness-topology 
  READY   @emsenn/claude-code-cli-harness-topology  0 refs
  blocked @emsenn/trace-topology                    3 refs: lib/llm-topology lib/llm-topology/.tmp/test-dist/index.mjs 
  READY   @emsenn/decision-topology                 0 refs
  READY   @emsenn/jsnode-codecs                     0 refs
  blocked @emsenn/jsnode-topology                   5 refs: apps/jsnode-computer lib/jsnode-codecs services/jsnode-server 
  READY   @561-group/semantic-hypertext-packet      0 refs
---
decommission-READY (0 live refs): 18    still-blocked: 29
```
