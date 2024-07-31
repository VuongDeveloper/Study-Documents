package patterns.creational.abstractFactory.ingredients.factory;

import patterns.constant.DevType;

public class FactoryProducer {
    private static final String MESSAGE = "Expert developer must choose between backend and frontend";

    public static AbstractDeveloperFactory getFactory(DevType devType) {
        return switch (devType) {
            case BACK_END -> new BackendDeveloperFactory();
            case FRONT_END -> new FrontendDeveloperFactory();
            default -> throw new RuntimeException(MESSAGE);
        };
    }
}
