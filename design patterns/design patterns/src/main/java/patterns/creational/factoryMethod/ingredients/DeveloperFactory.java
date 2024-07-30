package patterns.creational.factoryMethod.ingredients;

public class DeveloperFactory {
    public static Developer getDeveloper(DevType devType) {
        return switch (devType) {
            case BACK_END -> new BackEndDev();
            case FRONT_END -> new FrontEndDev();
            default -> throw new RuntimeException("Dev type must be specified");
        };
    }
}
