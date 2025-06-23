import getLocation from './getLocation';
import getCurrentTime from './getCurrentTime';
import webSearch from './webSearch';
import draftEmail from './draftEmail';

export default {
    default: {
        webSearch,
        getLocation,
        getCurrentTime,
    },
    appConnections: {
        draftEmail,
    }
} as const;