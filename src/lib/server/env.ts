export const config = {
	database: {
		url: process.env.DATABASE_URL!
	},
	infomaniak: {
		clientId: process.env.INFOMANIAK_CLIENT_ID!,
		clientSecret: process.env.INFOMANIAK_CLIENT_SECRET!,
		redirectUri: process.env.INFOMANIAK_REDIRECT_URI!
	},
	session: {
		secret: process.env.SESSION_SECRET!
	},
	app: {
		url: process.env.PUBLIC_APP_URL!
	}
};
