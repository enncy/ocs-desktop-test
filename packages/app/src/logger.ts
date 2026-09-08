// @ts-check
import { LoggerCore } from '@ocs-desktop/common';
import { app } from 'electron';

export function Logger(...name: any[]) {
	return new LoggerCore(app.getPath('logs'), true, ...name);
}
