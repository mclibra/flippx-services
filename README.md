# Server

HopIN 1.0 RestFull APIs.

See the API's [documentation](DOCS.md).

## Commands

After you generate your project, these commands are available in `package.json`.

```bash
npm run develop # run the API in development mode
npm run prod # run the API in production mode
npm run docs # generate API docs
```

## Playing locally

First, you will need to install and run [MongoDB](https://www.mongodb.com/) in another terminal instance.

```bash
$ mongod
```

Then, run the server in development mode.

```bash
$ npm run develop
Express server listening on http://0.0.0.0:9000, in development mode
```
