import {restoreBom} from '../lenovo-shared/bom.js';

// The Lenovo AI rack as an interactive teardown: stages, inspect, BOM, risk signals, orbit, and an auto tour when
// left alone. Parts and counts come from ../lenovo-shared/bom.js.
restoreBom();
import('../lenovo-shared/live.js').then(({runLive}) => runLive());
