export type ILocation = {
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
    query: string;
}

export default {
    id: 'getLocation',
    name: 'Get Location',
    description: 'Get your approximate location. This will return the city, state, and country. ',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'get_current_time',
            description: 'Get the current time in the users timezone.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    config: {},
    execute: async function () {
        try {
            const location = await this._getLocation();
            if (!location) return 'Approximated location not able to be determined';
            return JSON.stringify({ city: location?.city, state: location?.regionName, country: location?.country });
        } catch (error) {
            console.error(error);
            return 'Error getting location';
        }
    },
    _getLocation: async function (): Promise<ILocation | null> {
        try {
            const location = await fetch('http://ip-api.com/json/');
            const data = await location.json();
            return data;
        } catch (error) {
            console.error(error);
            return null;
        }
    }
} as const;