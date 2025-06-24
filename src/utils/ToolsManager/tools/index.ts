import getLocation from './getLocation';
import getCurrentTime from './getCurrentTime';
import webSearch from './webSearch';
import webScraping from './webScraping';
import draftEmail from './draftEmail';
import draftText from './draftText';
import calendarEventCreation from './calendarEventCreation';
import calendarEventReading from './calendarEventReading';

export default {
    default: {
        webSearch,
        webScraping,
        getLocation,
        getCurrentTime,
    },
    appConnections: {
        draftEmail,
        draftText,
        calendarEventCreation,
        calendarEventReading,
    }
} as const;