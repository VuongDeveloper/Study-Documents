package patterns.creational.abstractFactory.ingredients.factory;

import patterns.constant.DevType;
import patterns.creational.abstractFactory.ingredients.entity.AngularDeveloper;
import patterns.creational.abstractFactory.ingredients.entity.Developer;
import patterns.creational.abstractFactory.ingredients.entity.ReactDeveloper;

public class FrontendDeveloperFactory extends AbstractDeveloperFactory{
    @Override
    public Developer getDeveloper(DevType devType) {
        final String MESSAGE = "Frontend Developer must choose programming language for between dynamic and scalability";
        return switch (devType) {
            case DYNAMIC -> new ReactDeveloper();
            case SCALABILITY -> new AngularDeveloper();
            default -> throw new RuntimeException(MESSAGE);
        };
    }
}
