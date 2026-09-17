import getLocation from './getLocation';
import webSearch from './webSearch';
import webScraping from './webScraping';
import draftEmail from './draftEmail';
import draftText from './draftText';
import calendarEventCreation from './calendarEventCreation';
import calendarEventReading from './calendarEventReading';
import summarize from './summarize';
import createFiles from './createFiles';

export default {
    default: {
        webSearch,
        webScraping,
        getLocation,
        summarize,
    },
    createFiles,
    appConnections: {
        draftEmail,
        draftText,
        calendarEventCreation,
        calendarEventReading,
    }
} as const;