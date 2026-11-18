import getLocation from './getLocation';
import getCurrentTime from './getCurrentTime';
import webSearch from './webSearch';
import webScraping from './webScraping';
import draftEmail from './draftEmail';
import draftText from './draftText';
import calendarEventCreation from './calendarEventCreation';
import calendarEventReading from './calendarEventReading';
import summarize from './summarize';
import createFiles from './createFiles';
import createScheduledJob from './createScheduledJob';
import setReminder from './setReminder';
import openApp from './openApp';

export default {
    default: {
        webSearch,
        webScraping,
        getLocation,
        getCurrentTime,
        summarize,
        createScheduledJob,
    },
    createFiles,
    appConnections: {
        draftEmail,
        draftText,
        calendarEventCreation,
        calendarEventReading,
        setReminder,
        openApp,
    }
} as const;