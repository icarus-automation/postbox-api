import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  const appController = new AppController(new AppService());

  describe('root', () => {
    it('should return "Hello World!"', async () => {
      await expect(appController.getHello()).resolves.toBe('Hello World!');
    });
  });
});
