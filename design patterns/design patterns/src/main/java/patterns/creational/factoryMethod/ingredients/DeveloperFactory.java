package patterns.creational.factoryMethod.ingredients;

import patterns.constant.DevType;

public class DeveloperFactory {
    public static Developer getDeveloper(DevType devType) {
        return switch (devType) {
            case BACK_END -> new BackEndDev();
            case FRONT_END -> new FrontEndDev();
            default -> throw new RuntimeException("Dev type must be specified");
        };
    }
}
