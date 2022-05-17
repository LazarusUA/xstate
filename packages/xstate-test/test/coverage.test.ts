import { configure, createTestModel } from '../src';
import { coversAllStates, coversAllTransitions } from '../src/coverage';
import { createTestMachine } from '../src/machine';

describe('coverage', () => {
  it('reports missing state node coverage', async () => {
    const machine = createTestMachine({
      id: 'test',
      initial: 'first',
      states: {
        first: {
          on: { NEXT: 'third' }
        },
        secondMissing: {},
        third: {
          initial: 'one',
          states: {
            one: {
              on: {
                NEXT: 'two'
              }
            },
            two: {},
            threeMissing: {}
          }
        }
      }
    });

    const testModel = createTestModel(machine);

    const plans = testModel.getShortestPlans();

    for (const plan of plans) {
      await testModel.testPlan(plan);
    }

    expect(
      testModel
        .getCoverage(coversAllStates())
        .filter((c) => c.status !== 'covered')
        .map((c) => c.criterion.description)
    ).toMatchInlineSnapshot(`
      Array [
        "Visits \\"test.secondMissing\\"",
        "Visits \\"test.third.threeMissing\\"",
      ]
    `);

    expect(() => testModel.testCoverage(coversAllStates()))
      .toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Visits \\"test.secondMissing\\"
      	Visits \\"test.third.threeMissing\\""
    `);
  });

  // https://github.com/statelyai/xstate/issues/729
  it('reports full coverage when all states are covered', async () => {
    const feedbackMachine = createTestMachine({
      id: 'feedback',
      initial: 'logon',
      states: {
        logon: {
          initial: 'empty',
          states: {
            empty: {
              on: {
                ENTER_LOGON: 'filled'
              }
            },
            filled: { type: 'final' }
          },
          on: {
            LOGON_SUBMIT: 'ordermenu'
          }
        },
        ordermenu: {
          type: 'final'
        }
      }
    });

    const model = createTestModel(feedbackMachine);

    for (const plan of model.getShortestPlans()) {
      await model.testPlan(plan);
    }

    const coverage = model.getCoverage(coversAllStates());

    expect(coverage).toHaveLength(5);

    expect(coverage.filter((c) => c.status !== 'covered')).toHaveLength(0);

    expect(() => model.testCoverage(coversAllStates())).not.toThrow();
  });

  it('skips filtered states (filter option)', async () => {
    const TestBug = createTestMachine({
      id: 'testbug',
      initial: 'idle',
      context: {
        retries: 0
      },
      states: {
        idle: {
          on: {
            START: 'passthrough'
          }
        },
        passthrough: {
          always: 'end'
        },
        end: {
          type: 'final'
        }
      }
    });

    const testModel = createTestModel(TestBug);

    const testPlans = testModel.getShortestPlans();

    const promises: any[] = [];
    testPlans.forEach((plan) => {
      plan.paths.forEach(() => {
        promises.push(testModel.testPlan(plan));
      });
    });

    await Promise.all(promises);

    expect(() => {
      testModel.testCoverage(
        coversAllStates({
          filter: (stateNode) => {
            return stateNode.key !== 'passthrough';
          }
        })
      );
    }).not.toThrow();
  });

  // https://github.com/statelyai/xstate/issues/981
  it.skip('skips transient states (type: final)', async () => {
    const machine = createTestMachine({
      id: 'menu',
      initial: 'initial',
      states: {
        initial: {
          initial: 'inner1',

          states: {
            inner1: {
              on: {
                INNER2: 'inner2'
              }
            },

            inner2: {
              on: {
                DONE: 'done'
              }
            },

            done: {
              type: 'final'
            }
          },

          onDone: 'later'
        },

        later: {}
      }
    });

    const model = createTestModel(machine);
    const shortestPlans = model.getShortestPlans();

    for (const plan of shortestPlans) {
      await model.testPlan(plan);
    }

    // TODO: determine how to handle missing coverage for transient states,
    // which arguably should not be counted towards coverage, as the app is never in
    // a transient state for any length of time
    model.testCoverage(coversAllStates());
  });

  it('tests transition coverage', async () => {
    const model = createTestModel(
      createTestMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              EVENT_ONE: 'b',
              EVENT_TWO: 'b'
            }
          },
          b: {}
        }
      })
    );

    await model.testPlans();

    expect(() => {
      model.testCoverage(coversAllTransitions());
    }).toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Transitions to state \\"a\\" on event \\"EVENT_TWO\\""
    `);

    await model.testPlans(model.getSimplePlans());

    expect(() => {
      model.testCoverage(coversAllTransitions());
    }).not.toThrow();
  });

  it('reports multiple kinds of coverage', async () => {
    const model = createTestModel(
      createTestMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              EVENT_ONE: 'b',
              EVENT_TWO: 'b'
            }
          },
          b: {}
        }
      })
    );

    await model.testPlans();

    expect(model.getCoverage([coversAllStates(), coversAllTransitions()]))
      .toMatchInlineSnapshot(`
      Array [
        Object {
          "criterion": Object {
            "description": "Visits \\"(machine)\\"",
            "predicate": [Function],
            "skip": false,
          },
          "status": "covered",
        },
        Object {
          "criterion": Object {
            "description": "Visits \\"(machine).a\\"",
            "predicate": [Function],
            "skip": false,
          },
          "status": "covered",
        },
        Object {
          "criterion": Object {
            "description": "Visits \\"(machine).b\\"",
            "predicate": [Function],
            "skip": false,
          },
          "status": "covered",
        },
        Object {
          "criterion": Object {
            "description": "Transitions to state \\"a\\" on event \\"EVENT_ONE\\"",
            "predicate": [Function],
          },
          "status": "covered",
        },
        Object {
          "criterion": Object {
            "description": "Transitions to state \\"a\\" on event \\"EVENT_TWO\\"",
            "predicate": [Function],
          },
          "status": "uncovered",
        },
      ]
    `);
  });

  it('tests multiple kinds of coverage', async () => {
    const model = createTestModel(
      createTestMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              EVENT_ONE: 'b',
              EVENT_TWO: 'b'
            }
          },
          b: {}
        }
      })
    );

    await model.testPlans(model.getShortestPlans());

    expect(() => {
      model.testCoverage([coversAllStates(), coversAllTransitions()]);
    }).toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Transitions to state \\"a\\" on event \\"EVENT_TWO\\""
    `);

    await model.testPlans(model.getSimplePlans());

    expect(() => {
      model.testCoverage([coversAllStates(), coversAllTransitions()]);
    }).not.toThrow();
  });

  it('tests states and transitions coverage by default', async () => {
    const model = createTestModel(
      createTestMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              EVENT_ONE: 'b',
              EVENT_TWO: 'b'
            }
          },
          b: {},
          c: {}
        }
      })
    );

    await model.testPlans();

    expect(() => {
      model.testCoverage();
    }).toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Visits \\"(machine).c\\"
      	Transitions to state \\"a\\" on event \\"EVENT_TWO\\""
    `);
  });

  it('configuration should be globally configurable', async () => {
    configure({
      coverage: [coversAllStates()]
    });

    const model = createTestModel(
      createTestMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              EVENT_ONE: 'b',
              EVENT_TWO: 'b'
            }
          },
          b: {},
          c: {}
        }
      })
    );

    await model.testPlans();

    expect(() => {
      model.testCoverage();
    }).toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Visits \\"(machine).c\\""
    `);

    // Reset defaults
    configure();

    expect(() => {
      model.testCoverage();
    }).toThrowErrorMatchingInlineSnapshot(`
      "Coverage criteria not met:
      	Visits \\"(machine).c\\"
      	Transitions to state \\"a\\" on event \\"EVENT_TWO\\""
    `);
  });
});
