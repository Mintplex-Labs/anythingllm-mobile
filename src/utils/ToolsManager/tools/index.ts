import getLocation from './getLocation';
import webSearch from './webSearch';
import webScraping from './webScraping';
import draftEmail from './draftEmail';
import draftText from './draftText';
import calendarEventCreation from './calendarEventCreation';
import calendarEventReading from './calendarEventReading';
import summarize from './summarize';

export default {
    default: {
        webSearch,
        webScraping,
        getLocation,
        summarize,
    },
    appConnections: {
        draftEmail,
        draftText,
        calendarEventCreation,
        calendarEventReading,
    }
} as const;